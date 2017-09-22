(function(JC) {

  JC.utils.twoSecTO = () => {
    setTimeout(()=> {
      console.log('Emit twoSecTO event')
      EVT.emit('TO1')
    }, 2000)
  }

  JC.utils.fourSecTO = () => {
    setTimeout(()=> {
      console.log('Emit fourSecTO and check events')
      EVT.emit('TO2')
      EVT.emit('check')
    }, 4000)
  }

  EVT.on('init', JC.utils.twoSecTO)
  EVT.on('TO1', JC.utils.fourSecTO)
  EVT.on('check', JC.utils.thisCheck)

})(JC);
