// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest'
import { commitActiveInput, flushActiveInput } from '../commitActiveInput'

function mount(html) {
  document.body.innerHTML = html
  return document.body.firstElementChild
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('flushActiveInput', () => {
  it('文本输入：补发 input/change 并失焦', () => {
    const input = mount('<input type="text" value="abc">')
    input.focus()
    let changes = 0
    input.addEventListener('change', () => { changes += 1 })

    expect(flushActiveInput()).toBe(true)
    expect(changes).toBe(1)
    expect(document.activeElement).not.toBe(input)
  })

  it('复选框：不补发 change，避免勾选被二次 toggle 还原', () => {
    const checkbox = mount('<input type="checkbox">')
    checkbox.focus()
    let changes = 0
    checkbox.addEventListener('change', () => { changes += 1 })

    expect(flushActiveInput()).toBe(false)
    expect(changes).toBe(0)
  })

  it('单选框：不补发 change', () => {
    const radio = mount('<input type="radio" name="x">')
    radio.focus()
    let changes = 0
    radio.addEventListener('change', () => { changes += 1 })

    expect(flushActiveInput()).toBe(false)
    expect(changes).toBe(0)
  })

  it('textarea：补发 change', () => {
    const textarea = mount('<textarea>note</textarea>')
    textarea.focus()
    let changes = 0
    textarea.addEventListener('change', () => { changes += 1 })

    expect(flushActiveInput()).toBe(true)
    expect(changes).toBe(1)
  })

  it('没有聚焦元素时返回 false', () => {
    mount('<input type="text">')
    expect(flushActiveInput()).toBe(false)
  })

  it('聚焦在按钮上时返回 false', () => {
    const button = mount('<button type="button">保存</button>')
    button.focus()
    expect(flushActiveInput()).toBe(false)
  })
})

describe('commitActiveInput', () => {
  it('提交复选框焦点不会触发额外的 change', async () => {
    const checkbox = mount('<input type="checkbox">')
    checkbox.focus()
    let changes = 0
    checkbox.addEventListener('change', () => { changes += 1 })

    await commitActiveInput()
    expect(changes).toBe(0)
  })
})
