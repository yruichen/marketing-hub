class HarnessError(RuntimeError):
    """Base error for stable harness failures."""


class UnknownCapabilityError(HarnessError):
    pass


class RunNotResumableError(HarnessError):
    pass


class RetryableHarnessError(HarnessError):
    pass


class NonRetryableHarnessError(HarnessError):
    pass
