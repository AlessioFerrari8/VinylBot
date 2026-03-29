// salva e legge i token Spotify di ogni utente in un file tokens.json


/**
 * leggo il file tokens.json, se non esiste restituisco
 */
const fs = require('fs');

const file = fs.readFile(tokens.json)

if (!file) return {}



/**
 * scrivo nel file
 */



