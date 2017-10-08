(function($, JC) {

  if(JC.postsFeed) return

  var dataFeed= JC.dataFeed = {};

  var postsFeed = function() {


    var $mainDIv = $('.posts-feed');

    $.getJSON("https://api.github.com/users/justyn-clark/repos", function(data) {

      dataFeed.dataLength = data.length

      //console.log(data)

      localStorage.setItem('data', JSON.stringify(data));

      for(let i = 0; i < dataFeed.dataLength; i++){

        var post =
              "<div class='posts-post'>" +
                "<div class='posts-image'></div>" +
                  "<div class='posts-post-content'>" +
                    "<a href='#' target='_blank'>" +
                      "<div class='content-inner'>" +
                        "<div class='content'>" +
                          "<div class='posts-time'><p class='time'>" + data[i].name + "</p></div>" +
                          "<div class='posts-subject'>" +
                          "<h2>" + data[i].url + "</h2>" +
                          "</div>" +
                        "</div>" +
                      "</div>" +
                    "</a>" +
                  "</div>" +
              "</div>";

        $mainDIv.append(post);

      }
    });
  };

  EVT.on('init', postsFeed)

})(jQuery, JC)
