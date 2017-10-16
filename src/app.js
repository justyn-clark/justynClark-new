import './js/modules/global';
import './js/modules/config';
import './js/modules/utils';
import './js/modules/objConstructor';
import './js/modules/handleClicks';
import './js/modules/canIUseData';
import './js/modules/input';
import './js/modules/weirdCase';
import './js/modules/randomNames';
import './js/modules/countdown';

//import {loadVideos} from './js/modules/loadVideos';

//EVT.on('init', loadVideos)

const canFight = (state) => ({
  fight: () => {
    console.log(`${state.name} slashes at the foe!`);
    state.stamina--;
  }
})

const fighter = (name) => {
  let state = {
    name,
    health: 100,
    stamina: 100
  }

  return Object.assign(state, canFight(state));
}

const canCast = (state) => ({
  cast: (spell) => {
    console.log(`${state.name} casts ${spell}!`);
    state.mana--;
  }
})

const mage = (name) => {
  let state = {
    name,
    health: 100,
    mana: 100
  }

  return Object.assign(state, canCast(state));
}

var slasher = fighter('Slasher')
var dasher = fighter('Dasher')
var stomper = fighter('Stomper')
var crusher = fighter('Crusher')


//slasher.fight();
//dasher.fight();
//stomper.fight();
//crusher.fight();

// Slasher slashes at the foe!
//console.log(slasher.stamina)  // 99

var scorcher = mage('Scorcher')
//scorcher.cast('fireball');    // Scorcher casts fireball!
//console.log(scorcher.mana)    // 99

const toolBox = ()=> {
  return ({
    click  : (arg) => {
      console.log(`${arg}`);
    },
    randNum: () => {
       return Math.floor(Math.random() * 100)
    }
  });
}

var tool = toolBox();

console.log(tool);
console.log(tool.click('click'));
console.log(tool.randNum());
