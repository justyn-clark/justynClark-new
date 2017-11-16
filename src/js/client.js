import { applyMiddleware, createStore } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import '../js/modules/global';
import '../js/modules/config';
import '../js/modules/utils';
import '../js/modules/liftGame';



function cond(val, cases, fallback, scope) {
  var theCase = cases.hasOwnProperty(val) ? cases[val] : fallback;
  return typeof theCase == "function" ?
    theCase.call(scope || this, val) :
    theCase;
}


var reducer = function(state, action) {
  if (action.type === "INC") {
      return state + 1
  }

  cond(action.type , {
    'ARMS' : () => ({...state, name: action.payload}),
    'YES'  : () => {"Which way to the gun show!"},
    'NO'   : () => "But don't you want that peak tho?",
    'q2'   : () => "Slow down slow down. Are you warmed up first? (YES or NO)",
  }, () => "Do you even lift bro?!? Tough luck we're are doing a full body 3 hour workout!");

  //return state

};


const logger = (store) => (next) => (action) => {
  console.log("Logged", action);
  return next(action);
};

const middleWare = applyMiddleware(logger);

const store = createStore(reducer, JC,  composeWithDevTools(middleWare))

store.subscribe(function() {
  console.log(store.getState());
});


store.dispatch({
    type: "ARMS",
    //payload: "So you want arms like Popeye eh? Are you ready to build those guns? (YES or NO)"
  })
//store.dispatch({type: "YES"})
//store.dispatch({type: "NO"})
//store.dispatch({type: "q2"})
