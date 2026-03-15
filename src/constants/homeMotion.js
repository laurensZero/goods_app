export const HOME_MOTION = Object.freeze({
  densityDurationMs: 140,
  sortDurationMs: 170,
  sortViewDurationMs: 160,
  viewFadeDurationMs: 180,
  viewTransformDurationMs: 220,
  easeStandard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  easeEmphasis: 'cubic-bezier(0.22, 1, 0.36, 1)'
})

export const HOME_MOTION_CSS_VARS = Object.freeze({
  '--home-motion-density-duration': `${HOME_MOTION.densityDurationMs}ms`,
  '--home-motion-sort-duration': `${HOME_MOTION.sortDurationMs}ms`,
  '--home-motion-sort-view-duration': `${HOME_MOTION.sortViewDurationMs}ms`,
  '--home-motion-view-fade-duration': `${HOME_MOTION.viewFadeDurationMs}ms`,
  '--home-motion-view-transform-duration': `${HOME_MOTION.viewTransformDurationMs}ms`,
  '--home-motion-ease-standard': HOME_MOTION.easeStandard,
  '--home-motion-ease-emphasis': HOME_MOTION.easeEmphasis
})
