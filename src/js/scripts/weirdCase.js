//var newStr = '';
//var str = "justin johnson";
//
//for(var i = 0; i < str.length; i = i + 2){
//  newStr += str[i];
//}
//console.log(newStr);

var chars = "";

function getEvenChars(str) {
  for (let i = 0; i < str.length; i = i + 2) {
      chars += str[i].toUpperCase()
  }
  //return str
  console.log(chars);
}

//console.log(3 % 2 == 0);
//getEvenChars('justin')

/*setInterval(function () {
  var body = document.querySelector('body')
    body.style.backgroundColor = "red"
}, 1000)*/

//console.log(today.toLocaleTimeString());

(function(JC) {

  //const today = new Date()
  //document.write(today.toLocaleTimeString())

  setInterval(function() {
    const today = new Date()
    var time =  today.toLocaleTimeString()
    if (time == '6:30:00 AM') {
      var body = document.querySelector('body')
      body.classList.toggle('night')
    }
    if (time == '10:20:00 PM') {
      var body = document.querySelector('body')
      body.classList.toggle('night')
    }
    //console.log(time);
  }, 1000)

  /*JC.utils.dayAndNight = function() {
    if (today.toLocaleTimeString().includes('1:34:00 AM')) {
      var body = document.querySelector('body')
      body.classList.toggle('night')
    }

    console.log(today.toLocaleTimeString());*/

    /*setInterval(function () {
      var body = document.querySelector('body')
      body.classList.toggle('night')
    }, 1000)*/

})(JC);

//JC.utils.dayAndNight()



