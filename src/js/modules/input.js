(function() {

  const answers = [];

  var messageDiv = document.querySelector('.message');
  var form = document.querySelector('.form');  // grab the form element

  // welcome messageDiv
  messageDiv.innerHTML = "What would you like you train today at the gym? Arms, Legs or Back?";

  const inputFunc = (e)=> {
    e.preventDefault();
    var inputValue = document.querySelector('[name=item]').value.toUpperCase();  // get value
    switch(inputValue) {
      case "ARMS":
        messageDiv.innerHTML = "So you want arms like Popeye eh? Are you ready to build those guns? (YES or NO)";
        var ready = document.querySelector('[name=item]').value.toUpperCase();  // get value
        console.log(ready + ' ' + "to rock");
        //var warmedUp =  document.querySelector('[name=item]').value.toUpperCase();
        /*if (ready === 'YES') {
          messageDiv.innerHTML = "Which way to the gun show!";
        } else {
          messageDiv.innerHTML = "But don't you want that peak tho?";
        }*/
        break;
      case "LEGS":
        messageDiv.innerHTML = "Wait a minute. We really should look in to the details";
        break;
      case "BACK":
        messageDiv.innerHTML = "go sit down then";
        break;
      default:
        messageDiv.innerHTML = "You're really undecided";
    }

    answers.push(inputValue);  // add input value to array

    localStorage.setItem('answers', JSON.stringify(answers)); // save input to local storage
    localStorage.setItem(JC.utils.randomNumber(), inputValue);

    var answersObj = JSON.parse(localStorage.getItem('answers'));
    console.log(answersObj);

    form.reset();

  }

  form.addEventListener('submit', inputFunc);

})();


