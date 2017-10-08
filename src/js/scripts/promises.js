/*function myAsyncFunction(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onload = () => {
      'use strict';
      if ((xhr.readyState == 4) && (xhr.status == 200)) {
        resolve(xhr.responseText);
        console.log(xhr.responseText);
      }
    }
    xhr.onerror = () => reject("There was an error bro");
    xhr.send();
  });
};
//console.log(myAsyncFunction('https://api.github.com/users/justyn-clark/repos'));
myAsyncFunction('https://api.github.com/users/justyn-clark/repos');*/



function ajaxProm(url) {
  let myFirstPromise = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onreadystatechange = () => {
      if ((xhr.readyState == 4) && (xhr.status == 200)) {
          resolve(JSON.parse(xhr.responseText));
      }
    }
    xhr.send();
  });

  myFirstPromise
    .then((repos) => console.log(repos[2].name))
    .catch((error) => console.log(error.message))
}

//ajaxProm('https://api.github.com/users/justyn-clark/repos');


/*
let myFirstPromise = new Promise((resolve, reject) => {
  // We call resolve(...) when what we were doing made async successful, and reject(...) when it failed.
  // In this example, we use setTimeout(...) to simulate async code.
  // In reality, you will probably be using something like XHR or an HTML5 API.
  setTimeout(function(){
    resolve("Success!"); // Yay! Everything went well!
  }, 250);
});

myFirstPromise.then((successMessage) => {
  // successMessage is whatever we passed in the resolve(...) function above.
  // It doesn't have to be a string, but if it is only a succeed message, it probably will be.
  console.log("Yay! " + successMessage);
});
*/
