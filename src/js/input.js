const counterFunc = ()=> {
  var count = 0
  return ()=> count += 1
}

const submitCount = counterFunc()

var forms = document.querySelector('.form')

function inputFunc(e) {
  e.preventDefault()
  var inputValue = this.querySelector('[name=item]').value
  localStorage.setItem(submitCount(), inputValue)
  this.reset()
}

//const submitBtn = document.querySelector('.form__submit')
forms.addEventListener('submit', inputFunc)
