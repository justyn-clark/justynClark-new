(function(JC) {

  var sidebar = JC.components.sidebar = {}

  const f = document.querySelector('.sidebar');

  sidebar.openSidebar = function() {
    f.classList.add('sidebar--open');
  }
  sidebar.closeSidebar = function() {
    f.classList.remove('sidebar--open');
  };

  sidebar.delay = function(callback, time) {
    setTimeout(callback, time)
  };

  sidebar.interval = function(callback, time) {
    setInterval(callback, time)
  };

  sidebar.slideToggle = function() {
    f.classList.toggle('sidebar--open');
  };

  sidebar.init = function() {
    //sidebar.interval(sidebar.slideToggle, 2000);
    sidebar.delay(sidebar.openSidebar, 2000);
  };

  EVT.on('init', sidebar.init);

})(JC);
