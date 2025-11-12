import axios from 'axios';

async function testInputDetection() {
  try {
    // Get chain 9
    const response = await axios.get('http://localhost:3035/chain/9?userId=admin');
    const chain = response.data.data;
    
    console.log('Chain:', chain.name);
    console.log('Steps:', chain.steps.length);
    
    // Simulate the input detection logic
    const fields = new Set();
    fields.add('userId'); // Always include userId
    
    // Scan all steps for {{input.*}} patterns
    chain.steps.forEach(step => {
      console.log(`\nStep: ${step.name}`);
      
      // Scan params
      if (step.params) {
        const paramsStr = JSON.stringify(step.params);
        console.log('Params string:', paramsStr);
        const matches = paramsStr.match(/\{\{input\.(\w+)\}\}/g);
        if (matches) {
          console.log('Param matches:', matches);
          matches.forEach(match => {
            const field = match.replace(/\{\{input\.|}\}/g, '');
            fields.add(field);
            console.log('Added field from params:', field);
          });
        }
      }

      // Scan conditional routing input mapping
      if (step.conditionalRouting && Array.isArray(step.conditionalRouting)) {
        step.conditionalRouting.forEach((rule, index) => {
          console.log(`Routing rule ${index + 1}:`, rule.description);
          if (rule.input_mapping) {
            const mappingStr = JSON.stringify(rule.input_mapping);
            console.log('Input mapping string:', mappingStr);
            const matches = mappingStr.match(/\{\{input\.(\w+)\}\}/g);
            if (matches) {
              console.log('Routing matches:', matches);
              matches.forEach(match => {
                const field = match.replace(/\{\{input\.|}\}/g, '');
                fields.add(field);
                console.log('Added field from routing:', field);
              });
            }
          }
        });
      }
    });

    // Scan output template
    if (chain.output_template) {
      const templateStr = JSON.stringify(chain.output_template);
      console.log('\nOutput template string:', templateStr);
      const matches = templateStr.match(/\{\{input\.(\w+)\}\}/g);
      if (matches) {
        console.log('Output template matches:', matches);
        matches.forEach(match => {
          const field = match.replace(/\{\{input\.|}\}/g, '');
          fields.add(field);
          console.log('Added field from output template:', field);
        });
      }
    }
    
    console.log('\nðŸŽ¯ Detected Input Fields:', Array.from(fields).sort());
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testInputDetection();
