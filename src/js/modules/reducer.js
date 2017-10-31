//
//const map = (fn, arr) => arr.reduce((acc, item, index, arr) => {
//  return acc.concat(fn(item, index, arr));
//}, []);
//


const map = function(fn , arr) {
  return arr.reduce(function(acc, item, index, arr) {
      return acc.concat(fn(item, index, arr));
  },[])
};

var list = ['fred', 4, 'billy', 5];

var f = function(x,y,z) {
  console.log(x,y,z);
};

console.log(map(f,list));


//const compose = (...fns) => x => fns.reduceRight((v, f) => f(v), x);


const compose = function(...fns) {
  return function (x) {
      return fns.reduceRight(function (v,f) {
        return f(v)
      }, x)
  }
}

const add1 = n => n + 1;
const double = n => n * 2;
const add1ThenDouble = compose(
  double,
  add1
);
console.log(add1ThenDouble(2)); // 6
// ((2 + 1 = 3) * 2 = 6)
