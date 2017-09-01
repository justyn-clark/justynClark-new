var JC = JC || {};

(function(JC) {

  var countdown = JC.countdown = {};

  var targetDate = "Sept 1, 2017 10:00:00"; // Set the date we're counting down to

  countdown.init = function () {
    setupClock();
    //setupCloseClickHandler(); //Get the time
  };

  var preload = function () {
    var countDownCookie = JC.utils.getCookie("countdownclosed");
    if (!countDownCookie){
      init();
    } else if (countDownCookie != "") {
      console.log("The cookie " + countDownCookie + " has been set.");
      document.querySelector('.countdown').hide();
    }
  };

  var setupClock = function() {
    var countDownDate = new Date(targetDate).getTime(); // Reading from the component
    var clock = setInterval(function() {
      var now       = new Date().getTime();
      var distance  = countDownDate - now;
      var days      = Math.floor(distance / (1000 * 60 * 60 * 24));
      var hours     = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var minutes   = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      var seconds   = Math.floor((distance % (1000 * 60)) / 1000);
      document.querySelector('.counter').innerHTML = digit(days) + ":" + digit(hours) + ":" + digit(minutes) + ":" + digit(seconds);
      if (distance < 0) {
        clearInterval(clock);
        document.querySelector('.counter').innerHTML = "NOW LIVE" // End countdown and display message
      }
    }, 1000);
  };


  var digit = function(n) {
    return n > 9 ? "" + n : "0" + n;
  };

  var setupCloseClickHandler = function() {
    document.querySelector('.counter').addEventListener('click', function (e) {
      e.preventDefault();
      //document.querySelector('.countdown').slideUp();
      JC.utils.setCookie("countdownclosed", true, {expireDate: (3600 * 24 * 365)});
    });
  };

  EVT.on('init', countdown.init)

  //init();
  //preload();

})(JC);
