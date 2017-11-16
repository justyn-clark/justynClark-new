/*
function objLitSwitch (prop) {
  var obj = {
     'a': 'Mary Moose Has a Goose',
     'b': 'Bob the big boy toy',
     'c': 'Lily the lint licker',
     'd': 'Sammy the slim ball'
  }
  return obj[prop]
};
*/

/*function objLitSwitch (prop) {
  return {
    'a': 'Mary Moose Has a Goose',
    'b': 'Bob the big boy toy',
    'c': 'Lily the lint licker',
    'd': 'Sammy the slim ball'
  }[prop]
};*/


const objLitSwitch = {
  'a': (c) => `Mary Moose Has a Goose ${c}`,
  'b': () => 'Bob the big boy toy',
  'c': () => 'Lily the lint licker',
  'd': () => {
    //return 'Sammy the slim ball';
    console.log('Sammy the slim ball');
  }
}


console.log(objLitSwitch['a']('boo boo'));
objLitSwitch['d']();





