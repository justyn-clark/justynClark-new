const Batman = (function () {
  const identity = "Bruce Wayne";

  return {
    fightCrime: function () {
      console.log("Cleaning up Gotham.");
    },

    goCivilian: function () {
      console.log("Attend social events as " + identity);
    }
  };
})();

//console.log(Batman.goCivilian());
//console.log(Batman.fightCrime());
