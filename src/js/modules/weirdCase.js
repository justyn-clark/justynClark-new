function getValueIndex(val, index, arr) {
  if (index % 2 == 0) {
    return val.toUpperCase()
  }
  if ((index % 2 == 1)) {
    return val.toLowerCase()
  }
}

export function weirdCase(string) {
  return string.split('').map(getValueIndex).join('');
};




