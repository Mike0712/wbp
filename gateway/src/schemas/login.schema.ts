const schema =  {
  type: 'object',
  properties: {
    nickname: { type: 'string', minLength: 3 },
    password: { type: 'string', minLength: 6 },
    role: { type: 'string', minLength: 6 },
  },
  required: ['nickname', 'password'],
  additionalProperties: false,
};

export default schema; 