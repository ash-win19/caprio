import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  user: { name?: string; picture?: string } | null;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({ user, className, fallbackClassName }: UserAvatarProps) {
  const initial = user?.name?.trim().charAt(0).toUpperCase() || 'C';

  return (
    <Avatar className={className}>
      <AvatarImage
        src={user?.picture}
        alt={user?.name ? `${user.name}'s profile photo` : 'Profile photo'}
        className="object-cover"
        referrerPolicy="no-referrer"
      />
      <AvatarFallback className={cn('bg-primary text-sm font-semibold text-primary-foreground', fallbackClassName)}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
