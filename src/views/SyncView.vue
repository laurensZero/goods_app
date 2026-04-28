<template>
  <div class="page sync-page">
    <NavBar title="云同步" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section hero-section--sync">
        <article class="hero-card">
          <div class="hero-head">
            <div class="hero-copy">
              <p class="hero-label">Cloud Sync</p>
              <h1 class="hero-title">GitHub Gist 同步</h1>
              <p class="hero-desc">在多设备之间同步收藏、心愿单、回收站、充值记录、预设数据和本地图片。</p>
            </div>
            <span class="status-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
          </div>

          <div class="hero-grid">
            <div class="hero-metric">
              <p class="hero-metric__label">最近同步</p>
              <p class="hero-metric__value">{{ lastSyncDisplay }}</p>
            </div>
            <div class="hero-metric">
              <p class="hero-metric__label">远端 Gist</p>
              <p class="hero-metric__value hero-metric__value--mono">{{ syncStore.gistId || '未创建' }}</p>
            </div>
            <button
              v-if="showTokenInfo"
              type="button"
              class="hero-metric hero-metric--interactive"
              :disabled="!syncStore.token"
              @click="copyText(syncStore.token)"
            >
              <p class="hero-metric__label">同步 Token</p>
              <p class="hero-metric__value hero-metric__value--mono">{{ tokenDisplay }}</p>
            </button>
          </div>
        </article>
      </section>

      <section class="content-section overview-section">
        <div class="section-head">
          <p class="section-label">Sync Overview</p>
          <h2 class="section-title">同步概览</h2>
        </div>

        <div class="overview-grid">
          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Connection</p>
                <h3 class="panel-title">连接信息</h3>
              </div>
              <span class="panel-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
            </div>

            <div class="detail-list">
              <button v-if="showTokenInfo" type="button" class="detail-row detail-row--button" :disabled="!syncStore.token" @click="copyText(syncStore.token)">
                <span class="detail-label">Token</span>
                <span class="detail-value detail-value--mono">{{ tokenDisplay }}</span>
              </button>
              <div class="detail-row">
                <span class="detail-label">GitHub 账号</span>
                <span class="detail-value">{{ syncStore.githubLogin || '未登录' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Data Gist</span>
                <span class="detail-value detail-value--mono">{{ syncStore.gistId || '未创建' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">设备 ID</span>
                <span class="detail-value detail-value--mono">{{ syncStore.deviceId }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Image Gist</span>
                <span class="detail-value detail-value--mono">{{ resolvedImageGistId || '未创建' }}</span>
              </div>
              <div class="detail-row detail-row--last">
                <span class="detail-label">最近同步</span>
                <span class="detail-value">{{ lastSyncDisplay }}</span>
              </div>
            </div>
          </article>

          <article v-if="false" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Image Sync</p>
                <h3 class="panel-title">图片同步</h3>
              </div>
            </div>

            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">Image Gist</span>
                <span class="detail-value detail-value--mono">{{ resolvedImageGistId || '未创建' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">图片文件数</span>
                <span class="detail-value">{{ imageFileCount }}</span>
              </div>
              <article class="stat-card stat-card--image">
                <p class="stat-label">Images</p>
                <p class="stat-value">{{ imageFileCount }}</p>
                <p class="stat-desc">图片 Gist 当前保存的图片文件数量。</p>
              </article>
            </div>
            <p class="section-note">本地图片会同步到独立图片 Gist，最近图片同步时间：{{ imageSyncDisplay }}。</p>
          </article>

          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Remote Data</p>
                <h3 class="panel-title">远端数据</h3>
              </div>
            </div>

            <div class="stats-grid">
              <article class="stat-card stat-card--collection">
                <p class="stat-label">收藏</p>
                <p class="stat-value">{{ collectionCount }}</p>
                <p class="stat-desc">云端已记录的正式收藏条目。</p>
              </article>
              <article class="stat-card stat-card--wishlist">
                <p class="stat-label">心愿单</p>
                <p class="stat-value">{{ wishlistCount }}</p>
                <p class="stat-desc">云端当前标记为心愿单的条目。</p>
              </article>
              <article class="stat-card stat-card--wishlist">
                <p class="stat-label">充值</p>
                <p class="stat-value">{{ rechargeCount }}</p>
                <p class="stat-desc">云端保存的充值记录总数。</p>
              </article>
              <article class="stat-card stat-card--collection">
                <p class="stat-label">活动</p>
                <p class="stat-value">{{ eventCount }}</p>
                <p class="stat-desc">云端保存的活动总数。</p>
              </article>
              <article class="stat-card stat-card--image">
                <p class="stat-label">图片文件</p>
                <p class="stat-value">{{ imageFileCount }}</p>
                <p class="stat-desc">图片 Gist 当前保存的图片文件数量。</p>
              </article>
              <article class="stat-card stat-card--trash">
                <p class="stat-label">回收站</p>
                <p class="stat-value">{{ trashCount }}</p>
                <p class="stat-desc">云端保留的已删除数据数量。</p>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section actions-section">
        <div class="section-head">
          <p class="section-label">Sync Actions</p>
          <h2 class="section-title">同步操作</h2>
        </div>

        <div class="action-grid">
          <button
            type="button"
            class="entry-card"
            :disabled="syncStore.isSyncing || !syncStore.token"
            @click="handleSync"
          >
            <span class="entry-icon sync-icon">
              <svg v-if="!syncStore.isSyncing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
              <span v-else class="sync-spinner" aria-hidden="true" />
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Push & Resolve</p>
              <h3 class="entry-name">{{ syncStore.isSyncing ? (syncStore.syncStatus || '同步中') : '上传到云端' }}</h3>
              <p class="entry-desc">将收藏、充值、活动等数据同步到 Gist，若发现冲突会提示你选择处理方式。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button
            type="button"
            class="entry-card"
            :disabled="syncStore.isSyncing || !syncStore.gistId"
            @click="handlePull"
          >
            <span class="entry-icon pull-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Remote to Local</p>
              <h3 class="entry-name">拉取远端数据</h3>
              <p class="entry-desc">把各个 Gist 中的最新数据合并到当前设备，不会直接覆盖本地收藏。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <section class="content-section config-section">
        <div class="section-head">
          <p class="section-label">Config</p>
          <h2 class="section-title">配置与维护</h2>
        </div>

        <div class="action-grid">
          <a v-if="gistUrl" class="entry-card" :href="gistUrl" target="_blank" rel="noopener">
            <span class="entry-icon link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Remote Inspect</p>
              <h3 class="entry-name">查看数据 Gist</h3>
              <p class="entry-desc">直接打开当前 Gist 页面，检查远端文件、更新时间与历史版本。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

          <a v-if="imageGistUrl" class="entry-card" :href="imageGistUrl" target="_blank" rel="noopener">
            <span class="entry-icon link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Image Store</p>
              <h3 class="entry-name">查看图片 Gist</h3>
              <p class="entry-desc">打开独立图片 Gist，查看同步后的本地图片文件和更新时间。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

          <button type="button" class="entry-card" @click="openGithubLoginDialog">
            <span class="entry-icon token-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9" />
                <path d="M12 12l4.5-4.5" />
                <path d="M12 12h7" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">GitHub OAuth</p>
              <h3 class="entry-name">{{ syncStore.githubLogin ? `重新登录（${syncStore.githubLogin}）` : '使用 GitHub 授权登录' }}</h3>
              <p class="entry-desc">通过 Device Flow 完成授权，自动保存可用于同步、反馈和更新的访问令牌。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button v-if="showManualTokenEntry" type="button" class="entry-card" @click="openTokenDialog">
            <span class="entry-icon token-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">GitHub Access</p>
              <h3 class="entry-name">{{ syncStore.token ? '手动更换 Token' : '手动配置 Token' }}</h3>
              <p class="entry-desc">仍可手动保存带有 <code>gist</code> 权限的 Personal Access Token 作为备用方案。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button v-if="syncStore.gistId || resolvedImageGistId || resolvedRechargeGistId || resolvedEventGistId" type="button" class="entry-card entry-card--danger" @click="showResetConfirm = true">
            <span class="entry-icon danger-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Reset</p>
              <h3 class="entry-name">清除同步配置</h3>
              <p class="entry-desc">移除当前设备保存的 Token 和 Gist 配置，但不会删除 GitHub 上的远端数据。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <section class="content-section logs-section">
        <div class="section-head">
          <p class="section-label">Sync Trace</p>
          <h2 class="section-title">同步日志</h2>
        </div>

        <article class="panel-card log-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">Detailed Trace</p>
              <h3 class="panel-title">拉取 / 上传明细</h3>
            </div>
            <span class="panel-badge" :class="syncStore.isSyncing ? 'badge--syncing' : 'log-count-badge'">
              {{ syncStore.isSyncing ? '记录中' : `${syncStore.syncLogs.length} 条` }}
            </span>
          </div>

          <p class="section-note">这里会按文件和阶段分组展示同步日志。图片文件默认折叠，点开组标题就能看明细。</p>

          <div v-if="groupedSyncLogs.length > 0" class="log-groups">
            <article
              v-for="group in groupedSyncLogs"
              :key="group.key"
              class="log-group"
              :class="{ 'log-group--collapsed': !isLogGroupExpanded(group.key) }"
            >
              <button type="button" class="log-group-head" @click="toggleLogGroup(group.key)">
                <div class="log-group-head__copy">
                  <p class="log-group-title">{{ group.label }}</p>
                  <span class="log-group-meta">{{ group.logs.length }} 条</span>
                </div>

                <div class="log-group-head__stats">
                  <span v-if="group.totalDurationMs > 0" class="log-group-duration">{{ formatLogDuration(group.totalDurationMs) }}</span>
                  <svg class="log-group-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
              </button>

              <div v-show="isLogGroupExpanded(group.key)" class="log-group-body">
                <div class="log-list">
                  <article
                    v-for="entry in group.logs"
                    :key="entry.id"
                    class="log-item"
                    :class="`log-item--${entry.status}`"
                  >
                    <span class="log-dot" aria-hidden="true" />
                    <div class="log-content">
                      <div class="log-head">
                        <div class="log-title-row">
                          <p class="log-title">{{ entry.title }}</p>
                          <span class="log-status">
                            {{ entry.status === 'running' ? '进行中' : entry.status === 'success' ? '完成' : '失败' }}
                          </span>
                        </div>
                        <span class="log-time">{{ formatLogTime(entry.timestamp) }}</span>
                      </div>

                      <div class="log-meta">
                        <p class="log-detail">{{ entry.detail || '处理中...' }}</p>
                        <span v-if="entry.durationMs !== null" class="log-duration">{{ formatLogDuration(entry.durationMs) }}</span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="log-empty">
            开始同步后，这里会显示每个文件的读取步骤和耗时。
          </div>
        </article>
      </section>

      <Transition name="overlay-fade">
        <div v-if="showTokenDialog" class="overlay" @click.self="closeTokenDialog">
          <div class="dialog">
            <h3 class="dialog-title">配置 GitHub Token</h3>
            <p class="dialog-desc">
              需要一个包含 <code>gist</code> 权限的 Personal Access Token。
              <a href="https://github.com/settings/tokens/new?scopes=gist&description=goods-app-sync" target="_blank" rel="noopener">点击创建</a>
            </p>
            <input
              v-model="tokenInput"
              class="dialog-input"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              autocomplete="off"
            />
            <div v-if="tokenError" class="dialog-error">{{ tokenError }}</div>
            <div v-if="tokenValidLogin" class="dialog-success">已验证：{{ tokenValidLogin }}</div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="closeTokenDialog">取消</button>
              <button
                class="dialog-btn dialog-btn--primary"
                :disabled="isVerifyingToken || !tokenInput.trim()"
                @click="handleSaveToken"
              >
                {{ isVerifyingToken ? '验证中...' : '验证并保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <GithubLoginDialog
        v-model="showGithubLoginDialog"
        @login-success="handleGithubLoginSuccess"
        @toast="showToast"
      />

      <Transition name="overlay-fade">
        <div v-if="showResetConfirm" class="overlay" @click.self="showResetConfirm = false">
          <div class="dialog">
            <h3 class="dialog-title">确认清除配置</h3>
            <p class="dialog-desc">
              清除后需要重新配置 Token。远端 Gist 中的数据不会被删除。
            </p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="showResetConfirm = false">取消</button>
              <button class="dialog-btn dialog-btn--danger" @click="handleReset">确认清除</button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showPullConflict" class="overlay">
          <div class="dialog dialog--wide dialog--scrollable">
            <div class="dialog-scroll">
              <h3 class="dialog-title">检测到远端数据</h3>
              <div class="conflict-info">
                <div class="conflict-row">
                  <span class="conflict-label">来源设备</span>
                  <span class="conflict-value">{{ pullConflictData.remoteDevice }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">远端时间</span>
                  <span class="conflict-value">{{ formatTime(pullConflictData.remoteTime) }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">远端总数</span>
                  <span class="conflict-value">{{ pullConflictData.remoteCollectionCount }} 收藏，{{ pullConflictData.remoteWishlistCount }} 心愿单，{{ pullConflictData.remoteTrashCount }} 回收站，{{ pullConflictData.remoteRechargeCount || 0 }} 充值，{{ pullConflictData.remoteEventCount || 0 }} 活动，{{ pullConflictData.remoteImageCount || 0 }} 张图片</span>
                </div>
              </div>
              <div class="conflict-diff">
                <p class="conflict-diff-title">差异</p>
                <div class="conflict-diff-row">
                  <span class="conflict-diff-label">远端新增</span>
                  <span class="conflict-diff-value conflict-diff-value--add">+{{ pullConflictData.remoteOnlyCollection }} 收藏，+{{ pullConflictData.remoteOnlyWishlist }} 心愿单，+{{ pullConflictData.remoteOnlyTrash }} 回收站，+{{ pullConflictData.remoteOnlyRecharge || 0 }} 充值，+{{ pullConflictData.remoteOnlyEvents || 0 }} 活动，+{{ pullConflictData.remoteOnlyImages || 0 }} 张图片</span>
                </div>
                <div class="conflict-diff-row">
                  <span class="conflict-diff-label">远端修改</span>
                  <span class="conflict-diff-value conflict-diff-value--update">{{ pullConflictData.updatedGoods || 0 }} 条商品，{{ pullConflictData.updatedRecharge || 0 }} 条充值，{{ pullConflictData.updatedEvents || 0 }} 场活动，{{ pullConflictData.updatedImages || 0 }} 张图片</span>
                </div>
                <div class="conflict-diff-row">
                  <span class="conflict-diff-label">本地独有</span>
                  <span class="conflict-diff-value conflict-diff-value--local">{{ pullConflictData.localOnlyCollection }} 收藏，{{ pullConflictData.localOnlyWishlist }} 心愿单，{{ pullConflictData.localOnlyTrash }} 回收站，{{ pullConflictData.localOnlyRecharge || 0 }} 充值，{{ pullConflictData.localOnlyEvents || 0 }} 活动，{{ pullConflictData.localOnlyImages || 0 }} 张图片</span>
                </div>
              </div>
              <p class="conflict-desc">确认拉取后，当前设备会对齐远端状态。远端已经删除的数据，也会从本地同步移除。</p>
            </div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="handlePullConflict(false)">取消</button>
              <button class="dialog-btn dialog-btn--primary" :disabled="syncStore.isSyncing" @click="handlePullConflict(true)">
                确认拉取
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showSyncConflict" class="overlay">
          <div class="dialog dialog--scrollable">
            <div class="dialog-scroll">
              <h3 class="dialog-title">检测到冲突</h3>
              <p class="conflict-desc">远端存在其他设备更新的数据。下面会同时显示本地上次同步时间和本地最近修改时间。</p>
              <div class="conflict-info">
                <div class="conflict-row">
                  <span class="conflict-label">远端时间</span>
                  <span class="conflict-value">{{ formatTime(syncConflictData.remoteTime) }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">本地上次同步</span>
                  <span class="conflict-value">{{ formatTime(syncConflictData.localTime) || '从未同步' }}</span>
                </div>
                <div class="conflict-row">
                  <span class="conflict-label">本地最近修改</span>
                  <span class="conflict-value">{{ formatTime(syncConflictData.localModifiedTime) || '无本地改动' }}</span>
                </div>
              </div>
              <p class="conflict-desc">请选择要保留哪一边的数据：</p>
            </div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" :disabled="syncStore.isSyncing" @click="handleSyncConflict(false)">
                上传本地
              </button>
              <button class="dialog-btn dialog-btn--primary" :disabled="syncStore.isSyncing" @click="handleSyncConflict(true)">
                拉取远端
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="toast-fade">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSyncStore } from '@/stores/sync'
import { validateToken, getGist, getGistFileContent } from '@/utils/githubGist'
import {
  fetchGitHubUser,
  getGitHubDeviceFlowScope,
  getGitHubOAuthClientId,
  getGitHubVerificationUrl,
  pollGitHubAccessToken,
  requestGitHubDeviceCode
} from '@/utils/githubAuth'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import NavBar from '@/components/common/NavBar.vue'

const GithubLoginDialog = defineAsyncComponent(() => import('@/components/common/GithubLoginDialog.vue'))

const syncStore = useSyncStore()
const route = useRoute()
const router = useRouter()
const githubOAuthClientId = getGitHubOAuthClientId()
const githubDeviceScope = getGitHubDeviceFlowScope()

const pageBodyRef = ref(null)
const showTokenDialog = ref(false)
const showGithubLoginDialog = ref(false)
const showResetConfirm = ref(false)
const showPullConflict = ref(false)
const showSyncConflict = ref(false)
const syncConflictData = ref({})
const tokenInput = ref('')
const tokenError = ref('')
const tokenValidLogin = ref('')
const isVerifyingToken = ref(false)
const githubDeviceInfo = ref(null)
const githubLoginStatus = ref('')
const githubLoginError = ref('')
const isRequestingGithubDeviceCode = ref(false)
const isPollingGithubLogin = ref(false)
const toastMsg = ref('')
const gistInfo = ref(null)
const pullConflictData = ref({})
let githubLoginAbortController = null
const LOG_GROUP_SEQUENCE = [
  'manifest',
  'data',
  'recharge-data',
  'events-data',
  'image-gist',
  'recharge-gist',
  'event-gist',
  'image-merge',
  'local-collection',
  'local-recharge',
  'local-event',
  'update-image-gist',
  'update-main-gist',
  'image-file',
  'event-cover-file',
  'other'
]
const LOG_GROUP_LABELS = {
  manifest: 'manifest.json',
  data: 'data.json',
  'recharge-data': 'recharge-data.json',
  'events-data': 'events-data.json',
  'image-gist': '图片 Gist',
  'recharge-gist': '充值 Gist',
  'event-gist': '活动 Gist',
  'image-merge': '图片恢复',
  'local-collection': '本地收藏 / 回收站',
  'local-recharge': '本地充值',
  'local-event': '本地活动',
  'update-image-gist': '图片 Gist 更新',
  'update-main-gist': '主同步 Gist 更新',
  'image-file': '图片文件',
  'event-cover-file': '活动封面',
  other: '其他'
}
const DEFAULT_OPEN_LOG_GROUPS = []
const expandedLogGroups = ref(new Set(DEFAULT_OPEN_LOG_GROUPS))

const groupedSyncLogs = computed(() => {
  const groupMap = new Map()

  for (const entry of syncStore.syncLogs) {
    const key = resolveLogGroupKey(entry)
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        label: LOG_GROUP_LABELS[key] || LOG_GROUP_LABELS.other,
        logs: []
      })
    }

    groupMap.get(key).logs.push(entry)
  }

  const orderedGroups = []
  for (const key of LOG_GROUP_SEQUENCE) {
    const group = groupMap.get(key)
    if (group) {
      orderedGroups.push({
        ...group,
        totalDurationMs: group.logs.reduce((sum, log) => sum + (Number(log.durationMs) || 0), 0)
      })
      groupMap.delete(key)
    }
  }

  for (const group of groupMap.values()) {
    orderedGroups.push({
      ...group,
      totalDurationMs: group.logs.reduce((sum, log) => sum + (Number(log.durationMs) || 0), 0)
    })
  }

  return orderedGroups
})

function resolveLogGroupKey(entry) {
  const title = String(entry?.title || '')

  if (title.includes('manifest.json')) return 'manifest'
  if (title.includes('recharge-data.json')) return 'recharge-data'
  if (title.includes('events-data.json')) return 'events-data'
  if (title.includes('data.json')) return 'data'
  if (title.includes('读取图片 Gist') || title.includes('检查图片 Gist')) return 'image-gist'
  if (title.includes('检查充值 Gist')) return 'recharge-gist'
  if (title.includes('检查活动 Gist')) return 'event-gist'
  if (title.includes('恢复收藏图片') || title.includes('恢复回收站图片') || title.includes('恢复活动封面')) return 'image-merge'
  if (title.includes('整理本地收藏/回收站数据')) return 'local-collection'
  if (title.includes('整理本地充值数据')) return 'local-recharge'
  if (title.includes('整理本地活动数据')) return 'local-event'
  if (title.includes('更新图片 Gist')) return 'update-image-gist'
  if (title.includes('更新主同步 Gist')) return 'update-main-gist'
  if (title.includes('读取图片文件')) return 'image-file'
  if (title.includes('读取活动封面文件')) return 'event-cover-file'

  return String(entry?.category || 'other') || 'other'
}

function isLogGroupExpanded(key) {
  return expandedLogGroups.value.has(key)
}

function toggleLogGroup(key) {
  const next = new Set(expandedLogGroups.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedLogGroups.value = next
}
let toastTimer = null

watch(() => syncStore.conflictData, (val) => {
  if (val?.isPullOnly) {
    pullConflictData.value = val
    showPullConflict.value = true
  } else {
    showPullConflict.value = false
  }
})

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncedAt) return '从未同步'
  return formatTime(syncStore.lastSyncedAt)
})

const resolvedImageGistId = computed(() => gistInfo.value?.imageGistId || syncStore.imageGistId || '')
const resolvedRechargeGistId = computed(() => gistInfo.value?.rechargeGistId || syncStore.gistId || '')
const resolvedEventGistId = computed(() => gistInfo.value?.eventGistId || syncStore.gistId || '')

const statusBadgeClass = computed(() => {
  if (syncStore.isSyncing) return 'badge--syncing'
  if (syncStore.lastError) return 'badge--error'
  if (syncStore.githubLogin) return 'badge--success'
  if (!syncStore.token) return 'badge--warning'
  if (syncStore.gistId) return 'badge--success'
  return 'badge--warning'
})

const statusBadgeText = computed(() => {
  if (syncStore.isSyncing) return '同步中'
  if (syncStore.lastError) return '有错误'
  if (syncStore.githubLogin) return '已登录'
  if (!syncStore.token) return '未配置'
  if (syncStore.gistId) return '已连接'
  return '待上传'
})

const isUsingGithubLogin = computed(() => (
  !!syncStore.githubLogin && syncStore.githubAuthMethod === 'device-flow'
))

const showTokenInfo = computed(() => !isUsingGithubLogin.value)

const showManualTokenEntry = computed(() => !isUsingGithubLogin.value)

const githubVerificationUrl = computed(() => getGitHubVerificationUrl(githubDeviceInfo.value))
const githubDeviceExpiresText = computed(() => {
  if (!githubDeviceInfo.value?.expires_in) return '--'
  const expiresIn = Number(githubDeviceInfo.value.expires_in)
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return '--'
  const minutes = Math.floor(expiresIn / 60)
  const seconds = expiresIn % 60
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`
})

const tokenDisplay = computed(() => {
  if (!syncStore.token) return '未配置'
  const token = syncStore.token
  return `${token.slice(0, 4)}...${token.slice(-4)}`
})

const gistUrl = computed(() => {
  if (!syncStore.gistId) return ''
  return `https://gist.github.com/${syncStore.gistId}`
})

const imageGistUrl = computed(() => {
  if (!resolvedImageGistId.value) return ''
  return `https://gist.github.com/${resolvedImageGistId.value}`
})

const rechargeGistUrl = computed(() => {
  if (!resolvedRechargeGistId.value) return ''
  return `https://gist.github.com/${resolvedRechargeGistId.value}`
})

const eventGistUrl = computed(() => {
  if (!resolvedEventGistId.value) return ''
  return `https://gist.github.com/${resolvedEventGistId.value}`
})

const collectionCount = computed(() => gistInfo.value?.collectionCount ?? '-')
const wishlistCount = computed(() => gistInfo.value?.wishlistCount ?? '-')
const trashCount = computed(() => gistInfo.value?.trashCount ?? '-')
const rechargeCount = computed(() => gistInfo.value?.rechargeCount ?? '-')
const eventCount = computed(() => gistInfo.value?.eventCount ?? '-')
const imageFileCount = computed(() => gistInfo.value?.imageFileCount ?? '-')
const imageSyncDisplay = computed(() => {
  if (!gistInfo.value?.imageUpdatedAt) return '未同步图片'
  return formatTime(gistInfo.value.imageUpdatedAt)
})

function resetPageScrollTop() {
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatLogTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatLogDuration(durationMs) {
  const numericDuration = Number(durationMs)
  if (!Number.isFinite(numericDuration)) return ''

  const seconds = numericDuration / 1000
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} 秒`
}

function showToast(message, duration = 2600) {
  toastMsg.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, duration)
}

async function loadGistInfo() {
  if (!syncStore.token || !syncStore.gistId) {
    gistInfo.value = null
    return
  }

  try {
    const gist = await getGist(syncStore.token, syncStore.gistId)
    if (!gist) {
      gistInfo.value = null
      return
    }

    const [content, manifestContent, rechargeContent, eventContent] = await Promise.all([
      getGistFileContent(syncStore.token, gist, 'data.json'),
      getGistFileContent(syncStore.token, gist, 'manifest.json'),
      getGistFileContent(syncStore.token, gist, 'recharge-data.json'),
      getGistFileContent(syncStore.token, gist, 'events-data.json')
    ])
    const manifest = manifestContent ? JSON.parse(manifestContent) : null

    let nextCollectionCount = 0
    let nextWishlistCount = 0
    let nextTrashCount = 0
    let nextRechargeCount = 0
    let nextEventCount = 0

    if (content) {
      try {
        const data = JSON.parse(content)
        const goods = Array.isArray(data.goods) ? data.goods : []
        nextCollectionCount = goods.filter((item) => !item.isWishlist).length
        nextWishlistCount = goods.filter((item) => item.isWishlist).length
        nextTrashCount = Array.isArray(data.trash) ? data.trash.length : 0
      } catch {
        // ignore parse error
      }
    }

    if (rechargeContent) {
      try {
        const rechargeData = JSON.parse(rechargeContent)
        nextRechargeCount = Array.isArray(rechargeData.recharge) ? rechargeData.recharge.length : 0
      } catch {
        nextRechargeCount = 0
      }
    }

    if (eventContent) {
      try {
        const eventData = JSON.parse(eventContent)
        nextEventCount = Array.isArray(eventData.events) ? eventData.events.length : 0
      } catch {
        nextEventCount = 0
      }
    }

    gistInfo.value = {
      collectionCount: nextCollectionCount,
      wishlistCount: nextWishlistCount,
      trashCount: nextTrashCount,
      rechargeCount: nextRechargeCount,
      eventCount: nextEventCount,
      imageGistId: manifest?.imageGistId || '',
      rechargeGistId: syncStore.gistId || '',
      eventGistId: syncStore.gistId || '',
      imageFileCount: Number(manifest?.imageFileCount) || 0,
      imageUpdatedAt: manifest?.imageUpdatedAt || ''
    }
  } catch {
    gistInfo.value = null
  }
}

function buildImageSyncText(result) {
  const parts = []
  if (result?.uploadedImages > 0) parts.push(`上传 ${result.uploadedImages} 张图片`)
  if (result?.reusedImages > 0) parts.push(`复用 ${result.reusedImages} 张图片`)
  if (result?.restoredImages > 0) parts.push(`恢复 ${result.restoredImages} 张图片`)
  return parts.join('，')
}

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
}

function openEventGist() {
  if (!eventGistUrl.value) {
    showToast('还没有活动 Gist')
    return
  }
  window.open(eventGistUrl.value, '_blank', 'noopener')
}

function buildEventSyncSummary(result) {
  if (!result) return ''
  if (result.action === 'no_changes') return ''
  return `，活动 ${result.totalEvents ?? 0} 场`
}

function buildEventPullSummary(result) {
  if (!result) return ''
  const changed = Number(result.added || 0) + Number(result.updated || 0)
  if (changed <= 0) return '，活动无更新'
  return `，活动新增 ${result.added || 0} 场、更新 ${result.updated || 0} 场`
}

async function handleSync() {
  if (syncStore.isSyncing) return

  try {
    const result = await syncStore.fullSync()

    if (!result) {
      showToast('上传完成')
      await loadGistInfo()
      return
    }

    if (result.action === 'conflict') {
      syncConflictData.value = {
        remoteTime: syncStore.conflictData?.remoteTime,
        localTime: syncStore.conflictData?.localTime,
        localModifiedTime: syncStore.conflictData?.localModifiedTime
      }
      showSyncConflict.value = true
      return
    }

    let message = ''
    if (result.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      if (result.importedRecharge > 0) parts.push(`充值新增 ${result.importedRecharge} 条`)
      if (result.updatedRecharge > 0) parts.push(`充值更新 ${result.updatedRecharge} 条`)
      if (result.importedEvents > 0) parts.push(`活动新增 ${result.importedEvents} 场`)
      if (result.updatedEvents > 0) parts.push(`活动更新 ${result.updatedEvents} 场`)
      message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
    } else if (result.action === 'no_changes') {
      message = '数据已经是最新，无需上传'
    } else if (result.action === 'pushed') {
      if (result.hasChanges) {
        const parts = []
        if (result.updatedGoods > 0) parts.push(`收藏 ${result.updatedGoods} 件`)
        if (result.updatedTrash > 0) parts.push(`回收站 ${result.updatedTrash} 条`)
        if (result.updatedRecharge > 0) parts.push(`充值 ${result.updatedRecharge} 条`)
        if (result.updatedEvents > 0) parts.push(`活动 ${result.updatedEvents} 场`)
        message = `上传完成，${parts.join('，')}`
      } else {
        message = '已按当前本地数据重新上传'
      }
    } else {
      message = '上传完成'
    }

    showToast(message, 3500)
    await loadGistInfo()
  } catch (error) {
    showToast(`上传失败：${error.message}`)
  }
}

async function handlePull() {
  if (syncStore.isSyncing) return

  try {
    const result = await syncStore.pullOnly()

    if (result?.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      if (result.importedRecharge > 0) parts.push(`充值新增 ${result.importedRecharge} 条`)
      if (result.updatedRecharge > 0) parts.push(`充值更新 ${result.updatedRecharge} 条`)
        if (result.importedEvents > 0) parts.push(`活动新增 ${result.importedEvents} 场`)
        if (result.updatedEvents > 0) parts.push(`活动更新 ${result.updatedEvents} 场`)
      let message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
      showToast(message, 3500)
      await loadGistInfo()
    } else if (result?.action === 'no_changes') {
      let message = '数据已经是最新'
      showToast(message, 3500)
      await loadGistInfo()
    }
  } catch (error) {
    showToast(`拉取失败：${error.message}`)
  }
}

async function handlePullConflict(confirm) {
  showPullConflict.value = false
  try {
    const result = await syncStore.resolvePullConflict(confirm)

    if (result?.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      if (result.importedRecharge > 0) parts.push(`充值新增 ${result.importedRecharge} 条`)
      if (result.updatedRecharge > 0) parts.push(`充值更新 ${result.updatedRecharge} 条`)
        if (result.importedEvents > 0) parts.push(`活动新增 ${result.importedEvents} 场`)
        if (result.updatedEvents > 0) parts.push(`活动更新 ${result.updatedEvents} 场`)
      let message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
      showToast(message, 3500)
      await loadGistInfo()
    } else if (result?.action === 'cancelled') {
      showToast('已取消拉取')
    }
  } catch (error) {
    showToast(`拉取失败：${error.message}`)
  }
}

async function handleSyncConflict(useRemote) {
  try {
    const result = await syncStore.resolveConflict(useRemote)
    showSyncConflict.value = false

    if (result?.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      if (result.importedRecharge > 0) parts.push(`充值新增 ${result.importedRecharge} 条`)
      if (result.updatedRecharge > 0) parts.push(`充值更新 ${result.updatedRecharge} 条`)
        if (result.importedEvents > 0) parts.push(`活动新增 ${result.importedEvents} 场`)
        if (result.updatedEvents > 0) parts.push(`活动更新 ${result.updatedEvents} 场`)
      let message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
      showToast(message, 3500)
    } else if (result?.action === 'pushed') {
      showToast(`上传完成`, 3500)
    }
    await loadGistInfo()
  } catch (error) {
    showToast(useRemote ? `拉取失败：${error.message}` : `上传失败：${error.message}`)
  }
}

function openTokenDialog() {
  tokenInput.value = syncStore.token
  tokenError.value = ''
  tokenValidLogin.value = ''
  showTokenDialog.value = true
}

function resetGithubLoginState() {
  githubDeviceInfo.value = null
  githubLoginStatus.value = ''
  githubLoginError.value = ''
  isRequestingGithubDeviceCode.value = false
  isPollingGithubLogin.value = false
}

function closeGithubLoginDialog() {
  showGithubLoginDialog.value = false
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
  resetGithubLoginState()
}

function openGithubLoginDialog() {
  showGithubLoginDialog.value = true
  resetGithubLoginState()
  if (!githubOAuthClientId) {
    githubLoginError.value = '未配置 GitHub OAuth Client ID，请先设置 VITE_GITHUB_OAUTH_CLIENT_ID。'
  }
}

function openGithubVerificationPage() {
  const url = githubVerificationUrl.value
  if (!url) return
  window.open(url, '_blank', 'noopener')
}

function closeTokenDialog() {
  showTokenDialog.value = false
  tokenInput.value = ''
  tokenError.value = ''
  tokenValidLogin.value = ''
}

async function handleSaveToken() {
  const input = tokenInput.value.trim()
  if (!input) return

  isVerifyingToken.value = true
  tokenError.value = ''

  try {
    const check = await validateToken(input)
    if (!check.valid) {
      tokenError.value = 'Token 无效或网络错误'
      return
    }
    tokenValidLogin.value = check.login
    await syncStore.saveToken(input, { login: check.login, authMethod: 'token' })
    await syncStore.init()
    showToast(`Token 已保存（${tokenValidLogin.value}）`)
    closeTokenDialog()
    await loadGistInfo()
  } catch (error) {
    tokenError.value = error.message
  } finally {
    isVerifyingToken.value = false
  }
}

async function handleGithubLoginSuccess(user) {
  showToast(`GitHub 登录成功（${user.login}）`, 3200)
  showGithubLoginDialog.value = false
  await loadGistInfo()
}

onBeforeUnmount(() => {
  if (githubLoginAbortController) {
    githubLoginAbortController.abort()
    githubLoginAbortController = null
  }
})

async function handleReset() {
  await syncStore.resetConfig()
  gistInfo.value = null
  showResetConfirm.value = false
  showToast('配置已清除')
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await syncStore.init()
  await loadGistInfo()

  if (route.query.openLogin === '1') {
    openGithubLoginDialog()
    await router.replace({ path: route.path, query: {} })
  }
})
</script>

<style scoped src="../assets/views/SyncView.css"></style>
