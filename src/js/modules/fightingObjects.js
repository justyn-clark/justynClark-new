const canFight = (state) => ({
  punch() {
    console.log(`${state.name} from the ${state.team} punched the hoe!`);
    state.stamina--;
  },
  kick() {
    console.log(`${state.name} from the ${state.team} kicked the hoe!`);
    state.stamina--;
  },
  slap() {
    console.log(`${state.name} from the ${state.team} slapped the hoe!`);
    state.stamina--;
  },
  bite() {
    console.log(`${state.name} from the ${state.team} bite the hoe!`);
    state.stamina--;
  }
});

const canShoot = (state) => ({
  shoot(shot) {
    console.log(`${state.name} shoots ${shot}!`);
    state.mana--;
  }
});

const fighter = (name, team) => {
  let state = {
    name,
    team,
    health: 100,
    stamina: 100
  }
  return Object.assign(state, canFight(state), canShoot(state));
}
const shooter = (name) => {
  let state = {
    name,
    health: 100,
    mana: 100
  }
  return Object.assign(state, canShoot(state));
}

console.log(shooter());
console.log(fighter());

const villan = fighter('gonk', 'uptown');
const tyson = fighter('tyson', 'the flip mode squad');
console.log(villan);
console.log(typeof canFight());
console.log(typeof canFight);

//tyson.kick();
//tyson.slap();
//tyson.bite();
//tyson.punch();
//tyson.shoot('canons');

var bigGunz = shooter('Big Gunz');
//bigGunz.shoot('hot lead!!!');    // Shoots ... !

const toolBox = ()=> {
  return ({
    click: (arg) => {
      console.log(`${arg}`);
    },
    randNum: () => {
      return Math.floor(Math.random() * 100)
    }
  });
}

var tool = toolBox();
//console.log(tool);
//console.log(tool.click('clickity clack'));
//console.log(tool.randNum());
