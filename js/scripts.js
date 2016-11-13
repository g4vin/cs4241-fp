var lastentry = "";
$('#searchbox').keyup(function(event) {
    if($('#searchbox').val() != lastentry) {
        var currententry = $('#searchbox').val();
        function mCallback (data, status){
            $('#movielist').html(data);
            window.history.pushState(null, null, "search?search=" + currententry);     
        }
        
        $.get("search?search=" + currententry + "&inline=true", mCallback)
      
    }
    lastentry = $('#searchbox').val()
}); 

$(document).ready(function($) {
  if (window.history && window.history.pushState) {
    $(window).on('popstate', function() {     
	  location.reload();
    });    
  }
});
