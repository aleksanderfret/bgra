import { Container, Stack, Text, Title } from '@mantine/core';
import { RulesChat } from '@/features/rules-chat/RulesChat';

export default function Home() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={1}>Asystent zasad gier planszowych</Title>
          <Text c="dimmed">
            Odpowiedzi pochodzą wyłącznie z instrukcji, FAQ i errat wczytanych na tym komputerze.
          </Text>
        </Stack>
        <RulesChat />
      </Stack>
    </Container>
  );
}
