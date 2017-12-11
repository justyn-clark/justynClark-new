import './js/modules/global'
import './js/modules/config'
import './js/modules/utils'
import './js/modules/sidebar'
import './js/modules/droplet'
import './js/modules/youtubeData'
import $ from 'jquery'

import { clickHandlers } from './js/modules/handleClicks'
EVT.on('init', clickHandlers)

import 'babel-polyfill'
import './js/modules/asyncAwait'

$.getJSON('data/articles')


/*
/!*
import 'imagemin'
import 'imagemin-webp'

imagemin(['images/!*.{jpg}'], 'images', {
  use: [
    imageminWebp({quality: 60})
  ]
}).then(() => {
  //console.log(‘Images optimized’)
})
*!/

const imagemin = require('imagemin')
// const imageminJpegtran = require('imagemin-jpegtran')
// const imageminPngquant = require('imagemin-pngquant')

imagemin(['src/images/!*.{jpg,png}'], 'app/img', {
  plugins: [
    // imageminJpegtran(),
    // imageminPngquant({quality: '65-80'})
  ]
}).then(files => {
  console.log(files)
  // => [{data: <Buffer 89 50 4e …>, path: 'build/images/foo.jpg'}, …]
})
*/
