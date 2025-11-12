# Common Chain Patterns Library

Quick copy-paste patterns for building chains.

---

## Intent Classification Patterns

### Basic Intent Classification
```json
{
  "id": "step_1",
  "name": "Classify Player Intent",
  "module": "IntentInterpreter",
  "endpoint": "/interpret",
  "method": "POST",
  "body": {
    "message": "{{input.message}}",
    "userId": "{{input.userId}}"
  }
}
```

### Intent with Character Context
```json
{
  "id": "step_1",
  "name": "Interpret with Character Context",
  "module": "IntentInterpreter",
  "endpoint": "/interpret",
  "method": "POST",
  "body": {
    "message": "{{input.message}}",
    "userId": "{{input.userId}}",
    "user_character": "{{input.characterName}}",
    "meta_data": {
      "scene": "{{input.currentScene}}",
      "context": "{{input.gameContext}}"
    }
  }
}
```

---

## Character Patterns

### Get Character by ID
```json
{
  "id": "step_N",
  "name": "Get Character",
  "module": "CharacterController",
  "endpoint": "/characters/{{input.characterId}}",
  "method": "GET"
}
```

### Create New Character
```json
{
  "id": "step_N",
  "name": "Create Character",
  "module": "CharacterController",
  "endpoint": "/characters",
  "method": "POST",
  "body": {
    "name": "{{input.characterName}}",
    "userId": "{{input.userId}}",
    "class": "{{input.class}}",
    "level": 1,
    "attributes": {
      "strength": 10,
      "dexterity": 10,
      "intelligence": 10
    }
  }
}
```

### Update Character HP
```json
{
  "id": "step_N",
  "name": "Update Character HP",
  "module": "CharacterController",
  "endpoint": "/characters/{{input.characterId}}",
  "method": "PATCH",
  "body": {
    "currentHP": "{{step_N.result.calculatedHP}}"
  }
}
```

### List User's Characters
```json
{
  "id": "step_N",
  "name": "Get User Characters",
  "module": "CharacterController",
  "endpoint": "/characters",
  "method": "GET",
  "params": {
    "userId": "{{input.userId}}"
  }
}
```

---

## Item Patterns

### Get Character's Items
```json
{
  "id": "step_N",
  "name": "Get Character Inventory",
  "module": "ItemController",
  "endpoint": "/items",
  "method": "GET",
  "params": {
    "characterId": "{{input.characterId}}"
  }
}
```

### Create Item
```json
{
  "id": "step_N",
  "name": "Create Item",
  "module": "ItemController",
  "endpoint": "/items",
  "method": "POST",
  "body": {
    "name": "{{input.itemName}}",
    "type": "weapon",
    "ownerId": "{{input.characterId}}",
    "attributes": {
      "damage": 10,
      "durability": 100,
      "rarity": "common"
    }
  }
}
```

### Give Item to Character
```json
{
  "id": "step_N",
  "name": "Transfer Item",
  "module": "ItemController",
  "endpoint": "/items/{{input.itemId}}",
  "method": "PATCH",
  "body": {
    "ownerId": "{{input.characterId}}"
  }
}
```

---

## Scene Patterns

### Get Current Scene
```json
{
  "id": "step_N",
  "name": "Get Scene",
  "module": "SceneController",
  "endpoint": "/scenes/{{input.sceneId}}",
  "method": "GET"
}
```

### Create Scene
```json
{
  "id": "step_N",
  "name": "Create Scene",
  "module": "SceneController",
  "endpoint": "/scenes",
  "method": "POST",
  "body": {
    "name": "{{input.sceneName}}",
    "description": "{{input.sceneDescription}}",
    "userId": "{{input.userId}}",
    "data": {
      "npcs": [],
      "items": [],
      "exits": ["north", "south", "east", "west"]
    }
  }
}
```

### Update Scene
```json
{
  "id": "step_N",
  "name": "Update Scene",
  "module": "SceneController",
  "endpoint": "/scenes/{{input.sceneId}}",
  "method": "PATCH",
  "body": {
    "data": {
      "npcs": "{{step_N.result.updatedNpcs}}",
      "items": "{{step_N.result.updatedItems}}"
    }
  }
}
```

---

## Conditional Routing Patterns

### Route by Intent Type
```json
{
  "conditionalRouting": [
    {
      "description": "Combat intents",
      "condition": {
        "field": "intents[0].intent",
        "operator": "in_array",
        "value": ["attack", "defend", "magic"]
      },
      "action": "jump_to_chain",
      "target": 5,
      "input_mapping": {
        "userId": "{{input.userId}}",
        "intent": "{{step_1.result.intents[0]}}"
      }
    },
    {
      "description": "Social intents",
      "condition": {
        "field": "intents[0].intent",
        "operator": "in_array",
        "value": ["dialogue", "social", "emote"]
      },
      "action": "jump_to_chain",
      "target": 6,
      "input_mapping": {
        "userId": "{{input.userId}}",
        "intent": "{{step_1.result.intents[0]}}"
      }
    }
  ]
}
```

### Route by User Role
```json
{
  "conditionalRouting": [
    {
      "description": "Admin users",
      "condition": {
        "field": "role",
        "operator": "equals",
        "value": "admin"
      },
      "action": "jump_to_chain",
      "target": 10,
      "input_mapping": {
        "userId": "{{input.userId}}"
      }
    }
  ]
}
```

### Route by Confidence Score
```json
{
  "conditionalRouting": [
    {
      "description": "High confidence intents",
      "condition": {
        "field": "intents[0].confidence",
        "operator": "greater_than",
        "value": 0.8
      },
      "action": "jump_to_step",
      "target": 2
    },
    {
      "description": "Low confidence - ask for clarification",
      "condition": {
        "field": "intents[0].confidence",
        "operator": "less_than",
        "value": 0.5
      },
      "action": "jump_to_chain",
      "target": 99,
      "input_mapping": {
        "message": "{{input.message}}",
        "intent": "{{step_1.result.intents[0]}}"
      }
    }
  ]
}
```

### Route by Field Existence
```json
{
  "conditionalRouting": [
    {
      "description": "Has target in metadata",
      "condition": {
        "field": "intents[0].metadata.target",
        "operator": "exists",
        "value": true
      },
      "action": "jump_to_step",
      "target": 3
    }
  ]
}
```

---

## Output Template Patterns

### Simple Intent Output
```json
{
  "output_template": {
    "success": true,
    "primaryIntent": "{{step_1.result.intents[0].intent}}",
    "confidence": "{{step_1.result.intents[0].confidence}}",
    "metadata": "{{step_1.result.intents[0].metadata}}"
  }
}
```

### Character with Inventory
```json
{
  "output_template": {
    "character": "{{step_1.result}}",
    "inventory": "{{step_2.result}}",
    "inventoryCount": "{{step_2.result.length}}"
  }
}
```

### Game State Snapshot
```json
{
  "output_template": {
    "timestamp": "{{step_1.result.timestamp}}",
    "player": {
      "character": "{{step_1.result}}",
      "inventory": "{{step_2.result}}"
    },
    "scene": "{{step_3.result}}",
    "intent": "{{step_4.result.intents[0]}}"
  }
}
```

### Action Result
```json
{
  "output_template": {
    "action": "{{step_1.result.intents[0].intent}}",
    "target": "{{step_1.result.intents[0].metadata.target}}",
    "result": "{{step_2.result}}",
    "characterState": "{{step_3.result}}",
    "message": "Action completed successfully"
  }
}
```

---

## Complete Chain Examples

### Example 1: Player Action Processing
```json
{
  "name": "Process Player Action",
  "description": "Interprets player message and executes appropriate action",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Interpret Intent",
      "module": "IntentInterpreter",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}",
        "userId": "{{input.userId}}",
        "user_character": "{{input.characterName}}"
      }
    },
    {
      "id": "step_2",
      "name": "Get Character",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "GET"
    },
    {
      "id": "step_3",
      "name": "Get Scene",
      "module": "SceneController",
      "endpoint": "/scenes/{{input.sceneId}}",
      "method": "GET"
    }
  ],
  "output_template": {
    "intent": "{{step_1.result.intents[0]}}",
    "character": "{{step_2.result}}",
    "scene": "{{step_3.result}}",
    "timestamp": "{{step_1.result.timestamp}}"
  }
}
```

### Example 2: Combat Chain
```json
{
  "name": "Execute Combat",
  "description": "Handles combat actions with intent metadata",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Get Attacker",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "GET"
    },
    {
      "id": "step_2",
      "name": "Find Target",
      "module": "CharacterController",
      "endpoint": "/characters",
      "method": "GET",
      "params": {
        "name": "{{input.intent.metadata.target}}"
      }
    },
    {
      "id": "step_3",
      "name": "Calculate Damage",
      "module": "CharacterController",
      "endpoint": "/characters/{{step_2.result[0].id}}/damage",
      "method": "POST",
      "body": {
        "attacker": "{{step_1.result}}",
        "weapon": "{{input.intent.metadata.weapon}}",
        "amount": 10
      }
    }
  ],
  "output_template": {
    "success": true,
    "attacker": "{{step_1.result.name}}",
    "target": "{{step_2.result[0].name}}",
    "damage": 10,
    "targetHP": "{{step_3.result.currentHP}}"
  }
}
```

### Example 3: Item Management
```json
{
  "name": "Give Item to Character",
  "description": "Creates or transfers item to character",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Get or Create Item",
      "module": "ItemController",
      "endpoint": "/items",
      "method": "POST",
      "body": {
        "name": "{{input.itemName}}",
        "type": "{{input.itemType}}",
        "ownerId": "{{input.characterId}}",
        "attributes": "{{input.itemAttributes}}"
      }
    },
    {
      "id": "step_2",
      "name": "Get Updated Character",
      "module": "CharacterController",
      "endpoint": "/characters/{{input.characterId}}",
      "method": "GET"
    },
    {
      "id": "step_3",
      "name": "Get Character Inventory",
      "module": "ItemController",
      "endpoint": "/items",
      "method": "GET",
      "params": {
        "characterId": "{{input.characterId}}"
      }
    }
  ],
  "output_template": {
    "item": "{{step_1.result}}",
    "character": "{{step_2.result}}",
    "fullInventory": "{{step_3.result}}"
  }
}
```

### Example 4: Multi-Intent Router
```json
{
  "name": "Intent Router",
  "description": "Routes different intent types to specialized chains",
  "owner": "admin",
  "steps": [
    {
      "id": "step_1",
      "name": "Classify Intent",
      "module": "IntentInterpreter",
      "endpoint": "/interpret",
      "method": "POST",
      "body": {
        "message": "{{input.message}}",
        "userId": "{{input.userId}}"
      },
      "conditionalRouting": [
        {
          "description": "Combat Actions",
          "condition": {
            "field": "intents[0].intent",
            "operator": "in_array",
            "value": ["attack", "defend", "magic"]
          },
          "action": "jump_to_chain",
          "target": 5,
          "input_mapping": {
            "userId": "{{input.userId}}",
            "characterId": "{{input.characterId}}",
            "intent": "{{step_1.result.intents[0]}}"
          }
        },
        {
          "description": "Item Actions",
          "condition": {
            "field": "intents[0].intent",
            "operator": "in_array",
            "value": ["item_use", "gather", "trade"]
          },
          "action": "jump_to_chain",
          "target": 6,
          "input_mapping": {
            "userId": "{{input.userId}}",
            "characterId": "{{input.characterId}}",
            "intent": "{{step_1.result.intents[0]}}"
          }
        },
        {
          "description": "Movement",
          "condition": {
            "field": "intents[0].intent",
            "operator": "equals",
            "value": "movement"
          },
          "action": "jump_to_chain",
          "target": 7,
          "input_mapping": {
            "userId": "{{input.userId}}",
            "characterId": "{{input.characterId}}",
            "intent": "{{step_1.result.intents[0]}}"
          }
        }
      ]
    }
  ],
  "output_template": {
    "intent": "{{step_1.result.intents[0]}}",
    "routed": true
  }
}
```

---

## Copy-Paste Snippets

### Get All User Data
```json
[
  {
    "id": "step_1",
    "name": "Get Characters",
    "module": "CharacterController",
    "endpoint": "/characters",
    "method": "GET",
    "params": {"userId": "{{input.userId}}"}
  },
  {
    "id": "step_2",
    "name": "Get Items",
    "module": "ItemController",
    "endpoint": "/items",
    "method": "GET",
    "params": {"userId": "{{input.userId}}"}
  },
  {
    "id": "step_3",
    "name": "Get Scenes",
    "module": "SceneController",
    "endpoint": "/scenes",
    "method": "GET",
    "params": {"userId": "{{input.userId}}"}
  }
]
```

### Intent + Context Pattern
```json
{
  "id": "step_1",
  "name": "Interpret with Full Context",
  "module": "IntentInterpreter",
  "endpoint": "/interpret",
  "method": "POST",
  "body": {
    "message": "{{input.message}}",
    "userId": "{{input.userId}}",
    "user_id": "{{input.userId}}",
    "meta_data": {
      "intents": "{{step_previous.result.intents}}",
      "scene": "{{input.currentScene}}",
      "character": "{{input.characterName}}"
    },
    "user_character": "{{input.characterName}}"
  }
}
```
