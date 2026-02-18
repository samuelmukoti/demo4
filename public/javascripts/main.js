/* main.js - Client-side script for fetching and rendering user data */

document.addEventListener('DOMContentLoaded', function() {
  var skeletonUsers = document.getElementById('skeleton-users');
  var realUsers = document.getElementById('real-users');

  if (!skeletonUsers || !realUsers) {
    return;
  }

  fetch('/users/data')
    .then(function(response) {
      return response.json();
    })
    .then(function(users) {
      realUsers.innerHTML = users.map(function(user) {
        return '<div class="user-card"><strong>' + user.name + '</strong><p>' + user.email + '</p></div>';
      }).join('');

      skeletonUsers.style.display = 'none';
      realUsers.style.display = 'block';
    })
    .catch(function(err) {
      console.error(err);
      skeletonUsers.innerHTML = '<p>Failed to load users.</p>';
    });
});
