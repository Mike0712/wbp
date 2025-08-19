import React from 'react';

const AccountSelector = () => {
  const handleOpen = async (account: string) => {
    const res = await fetch(`/api/wb/session-link?account=${account}`);
    const data = await res.json();

    if (data.url) {
      window.open(data.url, '_blank');
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Выберите аккаунт</h2>
      <button onClick={() => handleOpen('account1')}>Открыть аккаунт 1</button>
      <button onClick={() => handleOpen('account2')} style={{ marginLeft: 10 }}>Открыть аккаунт 2</button>
    </div>
  );
};

export default AccountSelector;