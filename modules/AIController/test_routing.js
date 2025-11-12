import axios from 'axios';

async function testRouting() {
  try {
    const response = await axios.post('http://localhost:3035/execute/9?userId=admin', {
      input: {
        userId: 'user1',
        characterName: 'Thorin',
        message: 'I want to attack'
      }
    });
    
    console.log('Chain execution result:');
    console.log('Success:', response.data.data.success);
    console.log('Total steps:', response.data.data.steps?.length || 0);
    
    if (response.data.data.steps) {
      response.data.data.steps.forEach((step, index) => {
        console.log(`Step ${index + 1}: ${step.step_name} - ${step.success ? 'SUCCESS' : 'FAILED'}`);
        if (step.routing_evaluated) {
          console.log(`  ⚡ Routing: ${step.routing_action_taken}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testRouting();
