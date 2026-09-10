import { describe, it, expect } from 'vitest'
import { parseCsv, parseXlsx, parseTableFile, isTableFilename } from '../parseTable'
import { zipSync, strToU8 } from 'fflate'

describe('parseTable', () => {
  it('parseCsv：基础逗号分隔 + 表头/数据分离', () => {
    const result = parseCsv('name,price,qty\n吧唧,30,2\n立牌,50,1')
    expect(result.headers).toEqual(['name', 'price', 'qty'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual(['吧唧', '30', '2'])
  })

  it('parseCsv：引号内逗号与换行', () => {
    const result = parseCsv('name,note\n"吧唧, 双面","第一行\n第二行"')
    expect(result.headers).toEqual(['name', 'note'])
    expect(result.rows[0][0]).toBe('吧唧, 双面')
    expect(result.rows[0][1]).toBe('第一行\n第二行')
  })

  it('parseCsv：双引号转义', () => {
    const result = parseCsv('name\n"她说""你好"""')
    expect(result.rows[0][0]).toBe('她说"你好"')
  })

  it('parseCsv：自动探测制表符', () => {
    const result = parseCsv('name\tprice\n吧唧\t30')
    expect(result.headers).toEqual(['name', 'price'])
    expect(result.rows[0]).toEqual(['吧唧', '30'])
  })

  it('parseCsv：跳过空行与 BOM', () => {
    const result = parseCsv('﻿name,price\n\n吧唧,30\n\n')
    expect(result.headers).toEqual(['name', 'price'])
    expect(result.rows).toHaveLength(1)
  })

  it('parseCsv：空内容报错', () => {
    expect(() => parseCsv('')).toThrow('空')
  })

  it('parseXlsx：sharedStrings + 基础工作表', () => {
    const shared = `<?xml version="1.0"?>
      <sst>
        <si><t>name</t></si>
        <si><t>price</t></si>
        <si><t>吧唧</t></si>
      </sst>`
    const sheet = `<?xml version="1.0"?>
      <worksheet>
        <sheetData>
          <row r="1">
            <c r="A1" t="s"><v>0</v></c>
            <c r="B1" t="s"><v>1</v></c>
          </row>
          <row r="2">
            <c r="A2" t="s"><v>2</v></c>
            <c r="B2"><v>30</v></c>
          </row>
        </sheetData>
      </worksheet>`
    const files = {
      'xl/sharedStrings.xml': strToU8(shared),
      'xl/worksheets/sheet1.xml': strToU8(sheet)
    }
    const buf = zipSync(files)
    const result = parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    expect(result.headers).toEqual(['name', 'price'])
    expect(result.rows[0]).toEqual(['吧唧', '30'])
  })

  it('parseXlsx：inlineStr 单元格', () => {
    const sheet = `<?xml version="1.0"?>
      <worksheet>
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>name</t></is></c>
          </row>
          <row r="2">
            <c r="A2" t="inlineStr"><is><t>立牌</t></is></c>
          </row>
        </sheetData>
      </worksheet>`
    const files = { 'xl/worksheets/sheet1.xml': strToU8(sheet) }
    const buf = zipSync(files)
    const result = parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    expect(result.headers).toEqual(['name'])
    expect(result.rows[0]).toEqual(['立牌'])
  })

  it('parseTableFile：按扩展名分发 csv', () => {
    const result = parseTableFile('goods.csv', 'name\n吧唧')
    expect(result.headers).toEqual(['name'])
  })

  it('isTableFilename：识别支持的扩展名', () => {
    expect(isTableFilename('a.csv')).toBe(true)
    expect(isTableFilename('a.XLSX')).toBe(true)
    expect(isTableFilename('a.png')).toBe(false)
  })
})
