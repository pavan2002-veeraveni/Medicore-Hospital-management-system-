import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/patient/dashboard',
}));
