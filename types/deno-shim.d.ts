// Khai báo tối thiểu cho Deno (Supabase Edge Runtime) để tsc kiểm tra được code functions trên Node.
declare namespace Deno {
  const env: { get(key: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
