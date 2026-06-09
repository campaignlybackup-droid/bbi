require('dotenv').config();

const aiProvider = require('./services/ai/index').getProvider();
const placesService = require('./services/placesService');

async function runTests() {
  console.log('============================================');
  console.log('🧪 TESTING GOOGLE PLACES API');
  console.log('============================================');
  
  if (!placesService.isConfigured()) {
    console.log('❌ Google Places API Key is NOT configured in .env');
  } else {
    console.log('✅ Google Places API Key found.');
    console.log('Searching for "Starbucks Mumbai"...');
    
    try {
      const placesResult = await placesService.searchPlaces('Starbucks', 'Mumbai');
      if (placesResult.error) {
        console.log('❌ Google Places Search Error:', placesResult.error);
      } else if (placesResult.results.length > 0) {
        console.log(`✅ Success! Found ${placesResult.results.length} results.`);
        console.log(`First result: ${placesResult.results[0].name} (${placesResult.results[0].address})`);
      } else {
        console.log('⚠️ No results found, but API call was successful.');
      }
    } catch (err) {
      console.log('❌ Failed to connect to Google Places API:', err.message);
    }
  }

  console.log('\n============================================');
  console.log('🧪 TESTING OPENAI PROVIDER');
  console.log('============================================');

  const businessInfo = {
    name: 'Bharat Coffee House',
    city_name: 'Delhi',
    cat_name: 'Cafes and Coffee Shops',
    verified: true
  };

  try {
    console.log('Testing generateListingContent...');
    const listing = await aiProvider.generateListingContent(businessInfo);
    console.log('✅ Success! Output:');
    console.log(`   Title: ${listing.seo_title}`);
    console.log(`   Summary: ${listing.summary.substring(0, 80)}...`);

    console.log('\nTesting generateFaqContent...');
    const faqs = await aiProvider.generateFaqContent(businessInfo);
    console.log(`✅ Success! Generated ${faqs.length} FAQs.`);
    if (faqs.length > 0) {
      console.log(`   Q: ${faqs[0].question}`);
      console.log(`   A: ${faqs[0].answer.substring(0, 80)}...`);
    }

    console.log('\nTesting content moderation...');
    const mod = await aiProvider.moderateContent('Buy cheap vi@gra now, guaranteed free money!');
    console.log('✅ Success! Output:');
    console.log(`   Is Clean: ${mod.isClean}`);
    console.log(`   Flags: ${mod.flags.join(', ')}`);
    
  } catch (err) {
    console.log('❌ OpenAI Test Failed:', err.message);
  }
  
  console.log('\n✅ All tests complete! Exit this script with Ctrl+C if it does not exit automatically.');
  process.exit(0);
}

runTests();
