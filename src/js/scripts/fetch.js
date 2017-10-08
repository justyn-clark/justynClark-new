(function() {
    function fetcher() {
      fetch('https://api.github.com/users/justyn-clark/repos')
        .then(function(response){
          return response.json()
        })
        .then(function(data){
          console.log(data)
        })
    };
    //EVT.on("init", fetcher())
})();
