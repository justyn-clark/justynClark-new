function getIndex(val, index) {
  if (index % 2 == 0) {
    return val.toUpperCase()
  }
  if (index % 2 == 1) {
    return val.toLowerCase()
  }
}

function toUpperLower(string) {
  return string.split('').map(getIndex).join('');
};

function toWeirdCase(text){
  return text.split(' ').map(function(val) {
    return toUpperLower(val)
  }).join(' ')

}

console.log(toWeirdCase('Weird string case'));
