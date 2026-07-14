// config.js
require('dotenv').config(); // Carrega variáveis do .env
const { createClient } = require('@supabase/supabase-js');

// Cria client do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,      // URL do Supabase
  process.env.SUPABASE_ANON_KEY, // Chave anon
//{ global: { headers: { 'X-Client-Info': 'ApoioUbá/1.0' } } }
);

module.exports = { supabase };