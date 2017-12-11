import { setPolicyCookie } from './cookies'
import { playRandomYouTubeVideo } from './youTubePlayer'
let { $on, qs } = JC.helpers

export function clickHandlers () {
  let logo = qs('.logo')
  let body = qs('body')
  let menuLink1 = qs('[rel="js-play"]')
  let overlay = qs('.overlay')

  $on(qs('.cookie-policy__close'), 'click', setPolicyCookie) // Cookie Policy

  $on(menuLink1, 'click', JC.utils.openOverlay) // open overlay

  $on(overlay, 'click', JC.utils.closeOverlay) // close overlay

  $on(menuLink1, 'click', playRandomYouTubeVideo) // open overlay

  $on(logo, 'click', function () {
    let header = qs('.header')
    header.classList.toggle('header--open')
    if (!body.classList.contains('overlay--open')) {
      body.classList.add('overlay--open')
    } else {
      body.classList.remove('overlay--open')
    }
  })
}
