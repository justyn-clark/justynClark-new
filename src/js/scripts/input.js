/*
(function(JC) {

  var form = document.querySelector('.form')

  const answers = []

  function inputFunc(e) {
    e.preventDefault()
    var inputValue = this.querySelector('[name=item]').value
    answers.push(inputValue)
    //console.log(answers)
    localStorage.setItem('answers', JSON.stringify(answers))
    var answersObj = JSON.parse(localStorage.getItem('answers'))
    console.log(answersObj);
    localStorage.setItem(JC.utils.randomNumber(), inputValue)
    this.reset()
  }
//const submitBtn = document.querySelector('.form__submit')
  form.addEventListener('submit', inputFunc)
})(JC);
*/
