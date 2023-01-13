const axios = require('axios');

const CONFIG = {
    "host": "127.0.0.1",
    "port": 9000
}

setInterval(async () => {
    await axios.get(`http://${CONFIG.host}:${CONFIG.port}/`, {
        headers: {
            "X-Flag": "DESYNC{How_Did_U_reAd_tHiS}"
        }
    });
}, 900);