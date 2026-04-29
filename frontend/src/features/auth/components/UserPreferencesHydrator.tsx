import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";

const UserPreferencesHydrator = () => {
  useUserPreferences();
  return null;
};

export default UserPreferencesHydrator;
