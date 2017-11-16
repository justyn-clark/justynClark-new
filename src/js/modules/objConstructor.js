
//function constructor(spec) {
//  let
//    {member} = spec,
//    {other} = other_constructor(spec),
//    method = function () {
//      // member, other, method, spec
//    };
//  return Object.freeze({
//    method,
//    other
//  });
//}

var mo = {
  name: 'mo mo',
  age: '54',
  city: 'Atown',
  state: 'Cali'
};

var tiller = {
  name: 'tiller bryson',
  age: '27',
  city: 'Detroit',
  state: 'Michigan'
};

var herbie = {
  name: 'Herbie Handcock',
  age: '63',
  city: 'New York',
  state: 'New York'
};

var tony = {
  name: 'Tony Williams',
  age: '61',
  city: 'Boston',
  state: 'Massachusett'
};

function constructor(spec) {
  let { name, age, city } = spec,
    //{other} = other_constructor(spec),
    method = function () {
      // member, other, method, spec
      console.log(name, age, city);
      console.log(spec);
    },
    punch = function() {
      console.log(`${name} from the ${city} punched the hoe!`);
    },
    kick = function() {
      console.log(`${name} from the ${city} kicked the hoe!`);
    },
    slap = function() {
      console.log(`${name} from the ${city} slapped the hoe!`);
    },
    bite = function() {
      console.log(`${name} from the ${city} bite the hoe!`);
    };

  return Object.freeze({
    method,
    name,
    age,
    city,
    punch,
    kick,
    slap,
    bite,
    //canShoot,
  });
}


const momo = constructor(mo);
const tillerBryson = constructor(tiller);
const HerbieHandcock = constructor(herbie);
const TonyWilliams = constructor(tony);



console.log(
  momo.method(),
  tillerBryson.method(),
  HerbieHandcock.method(),
  TonyWilliams.method(),
);
//console.log(Object.isFrozen(obj));
//console.log(obj.method());



var createUser = ({userName = 'Anonymous', avatar = 'anon.png'} = {}) => ({
  userName,
  avatar,
  constructor: createUser
});

var user = createUser({userName: 'bob', avatar: 'bob.png'});

//console.log(user);



/*
function green() {
  let a;
  return function yellow() {
    let b;
        … a …
  … b …
  };
    … a …
}
*/



/*
function green() {
  let a;
  return function yellow() {
    let b;
        … a …
  … b …
  };
    … a …
}
*/
