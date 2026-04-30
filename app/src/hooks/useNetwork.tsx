import React, { createContext, useContext, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

interface NetworkContextValue {
  online: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ online: true });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // online if we're connected AND the internet is reachable (when known)
      const isOnline =
        !!state.isConnected &&
        (state.isInternetReachable === null ||
          state.isInternetReachable === true);
      setOnline(isOnline);
    });
    NetInfo.fetch().then((state) => {
      const isOnline =
        !!state.isConnected &&
        (state.isInternetReachable === null ||
          state.isInternetReachable === true);
      setOnline(isOnline);
    });
    return () => unsub();
  }, []);

  return (
    <NetworkContext.Provider value={{ online }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
