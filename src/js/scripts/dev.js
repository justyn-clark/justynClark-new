import { randNumGen } from './js/modules/utils'

const firstNames = ['big', 'ol dirty', 'lil', 'the legendary', 'chief', 'boss']
const lastNames = ['mac', 'wig wig', 'bastard', 'mote', 'johnson', 'smasher']

function getRandName (arr) {
  return arr[randNumGen(arr.length)]
}

console.log(randNumGen(100))

document.querySelector('.randName').innerHTML = getRandName(firstNames) + ' ' + getRandName(lastNames)

function stringSplitter (str) {
  var word = str.split('')
  return word
}
const arr = stringSplitter('testing')

// const numbers = [1, 5, 10, 15, 22, 21, 32, 41, 11, 92, 54]

function mod (num){

  if ((num % 2 === 0)) {
    console.log((num % 2) + ' ' + 'is an even number')
  } else {
    console.log((num % 2) + ' ' + 'is an odd number')
  }
}

console.log(mod(12))

const str = 'Good Day'
const res = str.split('').map(function(val, index) {
  return index
})

console.log(`${res} ${str}`)
/*
var doubles = numbers.map(function(x) {
  return x * 2
})
var lus = numbers.map(function(x) {
  return (x % 2)
})
console.log(lus)*/

//console.log(3 % 2 == 0)
//getEvenChars('justin')

/*setInterval(function () {
  var body = document.querySelector('body')
    body.style.backgroundColor = 'red'
}, 1000)*/

//console.log(today.toLocaleTimeString())
(function (JC) {
  // const today = new Date()
  // document.write(today.toLocaleTimeString())

  setInterval(function() {
    const today = new Date()
    let time =  today.toLocaleTimeString()
    if (time === '6:30:00 AM') {
      let body = document.querySelector('body')
      body.classList.toggle('night')
    }
    if (time === '10:20:00 PM') {
      let body = document.querySelector('body')
      body.classList.toggle('night')
    }
    //console.log(time)
  }, 1000)

  /*JC.utils.dayAndNight = function() {
    if (today.toLocaleTimeString().includes('1:34:00 AM')) {
      let body = document.querySelector('body')
      body.classList.toggle('night')
    }

    console.log(today.toLocaleTimeString())*/

  /*setInterval(function () {
    let body = document.querySelector('body')
    body.classList.toggle('night')
  }, 1000)*/
})(JC)

//JC.utils.dayAndNight()
