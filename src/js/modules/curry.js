const arry = ['eggs', 'beacon', 'waffles', 'friut', 'coffee'];
const tech = [
  {
    "display": "HTML Tutorial",
    "url": "http://www.w3schools.com/html/default.asp"
  },
  {
    "display": "CSS Tutorial",
    "url": "http://www.w3schools.com/css/default.asp"
  },
  {
    "display": "JavaScript Tutorial",
    "url": "http://www.w3schools.com/js/default.asp"
  },
  {
    "display": "jQuery Tutorial",
    "url": "http://www.w3schools.com/jquery/default.asp"
  },
  {
    "display": "SQL Tutorial",
    "url": "http://www.w3schools.com/sql/default.asp"
  },
  {
    "display": "PHP Tutorial",
    "url": "http://www.w3schools.com/php/default.asp"
  },
  {
    "display": "XML Tutorial",
    "url": "http://www.w3schools.com/xml/default.asp"
  }
]
const people = [
  { name:'bob', age: 32, color:'blue', weapon:'sparkles'},
  { name:'jane', age: 21, color:'red', weapon:'stars'},
  { name:'same', age: 18, color:'black', weapon:'water'},
  { name:'liv', age: 24, color:'green', weapon:'fire'}
];


function list() {
  return Array.prototype.slice.call(arguments);
};

var list1 = list(1, 2, 3); // [1, 2, 3]

//console.log(list1);

var currier = function(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return function() {
    return fn.apply(this, args.concat(
      Array.prototype.slice.call(arguments, 0)))
  };
};

var makeSequence = function(start, end) {
  var results = [];

  for (let i = start; i <= end; i++) {
    results.push(i);
  };

  return results;

  console.log(results);

};

console.log(makeSequence(0,10));

var seq = currier(makeSequence, 0);

console.log(
  //seq(10)
);

var byebye = function(str1, str2) {
  return str1 + ' ' + str2;
};

var bb = currier(byebye, "Some really sweet text!");

console.log(
  //bb("I'll have to agree captain.", 3),
  bb("Dilly Dilly!!!")
);


