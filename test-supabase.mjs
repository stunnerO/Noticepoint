import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

try {
  const envConfig = fs.readFileSync('.env.local', 'utf-8')
  envConfig.split('\n').forEach(line => {
    const [key, ...value] = line.split('=')
    if (key && value) {
      process.env[key.trim()] = value.join('=').trim()
    }
  })
} catch (e) {
  console.error('Could not find .env.local file')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runTest() {
  console.log('⏳ Testing connection to:', supabaseUrl)
  
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error('❌ Connection failed:', error.message)
  } else {
    console.log('✅ Successfully connected to Supabase!')
  }
}

runTest()