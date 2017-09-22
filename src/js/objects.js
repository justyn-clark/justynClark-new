function CafeGoodEats(name, price) {
  this.name = name;
  this.price = price;
}

function BreakfastItem(name, price) {
  CafeGoodEats.call(this, name, price);
  this.category = 'breakfast';
}

function LunchItem(name, price) {
  CafeGoodEats.call(this, name, price);
  this.category = 'lunch';
}

function DinnerItem(name, price) {
  CafeGoodEats.call(this, name, price);
  this.category = 'dinner';
}


// Foods
var pancakes = new BreakfastItem('Pancakes', 13.99);
var omelette = new BreakfastItem('Omettle', 11.99);
var coffee = new BreakfastItem('Coffee', 2.99);
var cheeseGrits = new BreakfastItem('Cheese Grits', 4.99);
var pizza = new LunchItem('Pepperoni and Cheese Pizza', 10.99);
var steak = new DinnerItem('Steak', 27.50);


const myMenu = {
  pancakes,
  omelette,
  coffee,
  cheeseGrits,
  pizza,
  steak
}

console.log(myMenu);

