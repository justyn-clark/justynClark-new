var currier = function(fn) {
  var args = Array.prototype.slice.call(arguments, 1);

  return function() {
    return fn.apply(this, args.concat(
      Array.prototype.slice.call(arguments, 0)))
  };
};

var sequence = function(start, end) {
  var results = [];

  for (let i = start; i <= end; i++) {
    results.push(i);
  };

  return results;

};

var seq = currier(sequence, 5);
console.log(seq(10));

var byebye = function(str1, str2, x) {
  return str1 + ' ' + str2 + ' ' + x;
};

var bb = currier(byebye, "Some really sweet text!");

console.log(
  bb("I'll have to agree captain.", 3),
  bb("Dilly Dilly!!!", "vv")

);


