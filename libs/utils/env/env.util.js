export function getActionInput(name, env = process.env) {
  if (!name) {
    throw new Error('Input name is required');
  }

  const normalizedName = name.trim().replace(/\s+/g, '_').toUpperCase();
  const key = `INPUT_${normalizedName}`;

  // console.log('key', key);
  // console.log('env.key', env?.[key]);

  return env?.[key] ?? '';
}

export function getBooleanActionInput(name, env = process.env) {
  const value = getActionInput(name, env);
  if (!value) {
    return undefined;
  }

  return value.toLowerCase() === 'true';
}
