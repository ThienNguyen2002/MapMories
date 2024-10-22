const fpPromise = import('https://openfpcdn.io/fingerprintjs/v4')
  .then(FingerprintJS => FingerprintJS.load())

async function getUserState() {
  const response = await fetch('https://ipapi.co/json/');
  const data = await response.json();
  return data.country_code === 'US' ? data.region_code : null;
}

async function identifyUser() {
  const result = await fpPromise.then(fp => fp.get());
  const userId = result.visitorId;
  const userState = await getUserState();
  
  return { userId, userState };
}


// function setCookie(name, value, days) {
//   let expires = "";
//   if (days) {
//     const date = new Date();
//     date.setTime(date.getTime() + (days*24*60*60*1000));
//     expires = "; expires=" + date.toUTCString();
//   }
//   document.cookie = name + "=" + (value || "")  + expires + "; path=/";
// }

// function getCookie(name) {
//   const nameEQ = name + "=";
//   const ca = document.cookie.split(';');
//   for(let i=0;i < ca.length;i++) {
//     let c = ca[i];
//     while (c.charAt(0)==' ') c = c.substring(1,c.length);
//     if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
//   }
//   return null;
// }

// Export the identifyUser function
window.identifyUser = identifyUser;
