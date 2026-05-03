import { createContext, useContext } from "react";
import { useGetMe } from "@workspace/api-client-react";

export type UserRole = "admin" | "reviewer" | "viewer";

interface UserRoleContextValue {
  role: UserRole | null;
  isAdmin: boolean;
  isReviewer: boolean;
  isViewer: boolean;
  isLoaded: boolean;
  userId: number | null;
  clerkId: string | null;
  fullName: string | null;
  email: string | null;
}

const UserRoleContext = createContext<UserRoleContextValue>({
  role: null,
  isAdmin: false,
  isReviewer: false,
  isViewer: false,
  isLoaded: false,
  userId: null,
  clerkId: null,
  fullName: null,
  email: null,
});

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const { data, isSuccess } = useGetMe({
    query: { retry: false, staleTime: 5 * 60 * 1000 },
  });

  const role = (data?.role as UserRole) ?? null;

  return (
    <UserRoleContext.Provider
      value={{
        role,
        isAdmin: role === "admin",
        isReviewer: role === "reviewer" || role === "admin",
        isViewer: role === "viewer",
        isLoaded: isSuccess,
        userId: data?.id ?? null,
        clerkId: data?.clerkId ?? null,
        fullName: data?.fullName ?? null,
        email: data?.email ?? null,
      }}
    >
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
