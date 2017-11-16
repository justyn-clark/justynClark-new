let { qs } = JC.utils.helpers;

(function() {

  var form = qs('.form');  // grab the form element
  var liftGame_title = qs('.liftGame_title');
  var arms = qs('.arms');
  var back = qs('.back');
  var legs = qs('.legs');

  function cond(val, cases, fallback, scope) {
    var theCase = cases.hasOwnProperty(val) ? cases[val] : fallback;
    return typeof theCase == "function" ?
      theCase.call(scope || this, val) :
      theCase;
  }

  liftGame_title.innerHTML = 'What would you like you train today at the gym? Arms, Legs or Back?';

  function getVal(e) {
    e.preventDefault();
    var input = qs('[name=item]').value.toUpperCase();  // get value
    if (input == 'ARMS') {
      back.style.display = 'none';
      legs.style.display = 'none';
      liftGame_title.style.display = 'none';
    }
    if (input == 'BACK') {
      arms.style.display = 'none';
      legs.style.display = 'none';
      liftGame_title.style.display = 'none';
    }
    if (input == 'LEGS') {
      arms.style.display = 'none';
      back.style.display = 'none';
      liftGame_title.style.display = 'none';
    }
    arms.innerHTML = cond(input , {
      'ARMS' : () => {
        return `So you want arms like Popeye eh? Are you ready to build those guns? (YES or NO)`
      },
      'YES'  : () => "Which way to the gun show!",
      'NO'   : () => "But don't you want that peak tho?",
      'q2'   : () => "Slow down slow down. Are you warmed up first? (YES or NO)",
    }, () => "Do you even lift bro?!? Tough luck we're are doing a full body 3 hour workout!");
    back.innerHTML = cond(input, {
      'BACK': "Back is my favorite area to train by far. Are you jacked up? (YES or NO)",
      'YES' : "Rooooar like a BEAST!!!",
      'NO'  : "Do you even lift bro?",
      'q2'  : "Is your beastmode turned on? (YES or NO)",
    },"Do you even lift bro?!? Tough luck we're are doing a full body 3 hour workout!");
    legs.innerHTML = cond(input, {
        'LEGS'  : "It's leg day for sure. Don't want to pull a hammy. Are you warmed up? (YES or NO)",
        'YES'   : "Burn baby, Burn baby, Burn!",
        'NO'    : "Never skip leg day bro!",
        'q2'    : "Are you excited to feel the burn? (YES or NO)",
    },  "Do you even lift bro?!? Tough luck we're are doing a full body 3 hour workout!");
    this.reset();
  };
  form.addEventListener('submit', getVal);

  /*
    const inputFunc = (e)=> {
      e.preventDefault();
      var inputValue = qs('[name=item]').value.toUpperCase();  // get value

      answers.push(inputValue);  // add input value to array

      localStorage.setItem('answers', JSON.stringify(answers)); // save input to local storage
      localStorage.setItem(JC.utils.randomNumber(), inputValue);

      var answersObj = JSON.parse(localStorage.getItem('answers'));
      console.log(answersObj);

      form.reset();

    }
  */

})();
