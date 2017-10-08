(function() {

  const answers = [];

  var form = document.querySelector('.form');

  const inputFunc = (e)=> {
    e.preventDefault();

    var inputValue = document.querySelector('[name=item]').value;

    answers.push(inputValue)

    localStorage.setItem('answers', JSON.stringify(answers));

    var answersObj = JSON.parse(localStorage.getItem('answers'));

    console.log(answersObj);

    localStorage.setItem(JC.utils.randomNumber(), inputValue);

    //this.reset();

  }

  form.addEventListener('submit', inputFunc);

})();

