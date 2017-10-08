let startNum = 5;

(function(x, JC) {
  function loop(i) {
    if (i > 0) {
      loop(i - 1)
    }
    //console.log(`${i} is my loop iteration number for ${JC.config.developer}`);
  }
  loop(x)
})(startNum, JC);


