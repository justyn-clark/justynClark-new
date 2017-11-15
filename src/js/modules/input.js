
const inputFunc = (e)=> {
  e.preventDefault();
  var inputValue = document.querySelector('[name=item]').value.toUpperCase();  // get value

  answers.push(inputValue);  // add input value to array

  localStorage.setItem('answers', JSON.stringify(answers)); // save input to local storage
  localStorage.setItem(JC.utils.randomNumber(), inputValue);

  var answersObj = JSON.parse(localStorage.getItem('answers'));
  console.log(answersObj);

  form.reset();

}




